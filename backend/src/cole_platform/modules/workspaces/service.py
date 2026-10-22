"""Workspaces: per-(learner, assignment version) project directory + container via runner.

File operations act on the host directory that is bind-mounted into the container, with
strict path checks (no absolute paths, no `..`, no symlinks, `data/` is read-only).
"""
from __future__ import annotations

import io
import shutil
import tarfile
from pathlib import Path, PurePosixPath

from sqlalchemy import select
from sqlalchemy.orm import Session

from cole_platform.kernel import runner_client
from cole_platform.kernel.auth import Principal
from cole_platform.kernel.config import settings
from cole_platform.kernel.db import utcnow
from cole_platform.kernel.errors import AppError, bad_request, not_found
from cole_platform.kernel.ids import new_id
from cole_platform.kernel.storage import storage

from .models import Workspace, WorkspaceStepProgress

HIDDEN = {".local", "__pycache__", ".cache", ".ipynb_checkpoints", ".bash_history", ".python_history"}
MAX_TEXT = 2 * 1024 * 1024
MAX_UPLOAD = 200 * 1024 * 1024
MAX_TREE = 3000
DATA = "data"


def find_workspace(db: Session, user_id: str, av_id: str) -> Workspace | None:
    return db.scalar(select(Workspace).where(Workspace.user_id == user_id, Workspace.assignment_version_id == av_id))


def root_of(ws: Workspace) -> Path:
    return settings.workspaces_dir / ws.id


def data_root(db: Session, ws: Workspace) -> Path | None:
    from cole_platform.modules.assignments.models import AssignmentVersion

    av = db.get(AssignmentVersion, ws.assignment_version_id)
    if av and av.dataset_sha:
        p = settings.datasets_dir / av.dataset_sha
        return p if p.is_dir() else None
    return None


def _extract_template(key: str, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(storage.get_bytes(key)), mode="r:gz") as tar:
        for m in tar.getmembers():
            if not m.isfile():
                continue
            rel = PurePosixPath(m.name)
            if rel.is_absolute() or ".." in rel.parts:
                continue
            out = dest.joinpath(*rel.parts)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(tar.extractfile(m).read())


def open_workspace(db: Session, p: Principal, assignment_id: str) -> Workspace:
    from cole_platform.kernel.audit import audit
    from cole_platform.modules.assignments.service import get_for

    a, av, _ = get_for(db, p, assignment_id)
    ws = find_workspace(db, p.id, av.id)
    if not ws:
        ws = Workspace(id=new_id("ws"), user_id=p.id, assignment_id=a.id, assignment_version_id=av.id,
                       manifest=dict(av.default_manifest or {}))
        db.add(ws)
        db.flush()
        _extract_template(av.template_key, root_of(ws))
        audit(db, "workspace.create", actor_id=p.id, target_type="workspace", target_id=ws.id,
              meta={"assignment": a.slug, "version": av.version})
        db.commit()
    elif not root_of(ws).is_dir():
        _extract_template(av.template_key, root_of(ws))
    return ws


def get_owned(db: Session, p: Principal, ws_id: str, write: bool = False) -> Workspace:
    """Owner has full access; course teachers/admin may read (not write) learner workspaces."""
    from cole_platform.kernel.rbac import can_manage_course
    from cole_platform.modules.assignments.models import Assignment

    ws = db.get(Workspace, ws_id)
    if not ws:
        raise not_found("Workspace")
    if ws.user_id == p.id:
        return ws
    a = db.get(Assignment, ws.assignment_id)
    if not write and a and can_manage_course(db, p, a.course_id):
        return ws
    raise not_found("Workspace")


def ensure_container(db: Session, ws: Workspace) -> dict:
    dr = data_root(db, ws)
    res = runner_client.call("POST", f"/workspaces/{ws.id}/ensure", {"data_dir": str(dr) if dr else None}, timeout=120)
    ws.last_active_at = utcnow()
    db.commit()
    return res


# ------------------------------------------------------------------ paths

def _norm(rel: str) -> PurePosixPath:
    rel = (rel or "").replace("\\", "/").strip()
    pp = PurePosixPath(rel)
    if rel.startswith("/") or pp.is_absolute() or any(part in ("..", "") for part in pp.parts if part != ".") \
            or ":" in rel:
        raise AppError(400, "PATH_OUTSIDE_WORKSPACE", "Đường dẫn không hợp lệ hoặc nằm ngoài workspace.")
    return PurePosixPath(*[x for x in pp.parts if x != "."])


def resolve(db: Session, ws: Workspace, rel: str, for_write: bool = False) -> Path:
    pp = _norm(rel)
    if pp.parts and pp.parts[0] == DATA:
        if for_write:
            raise AppError(403, "READ_ONLY_PATH", "Thư mục data/ chỉ đọc.")
        base = data_root(db, ws)
        if base is None:
            raise not_found("Tệp")
        target = base.joinpath(*pp.parts[1:])
    else:
        base = root_of(ws)
        target = base.joinpath(*pp.parts)
    # reject symlinks anywhere along the path
    cur = base
    for part in target.relative_to(base).parts:
        cur = cur / part
        if cur.is_symlink():
            raise AppError(400, "SYMLINK_NOT_ALLOWED", "Không hỗ trợ liên kết tượng trưng (symlink).")
    rb = base.resolve()
    rt = target.resolve()
    if rt != rb and rb not in rt.parents:
        raise AppError(400, "PATH_OUTSIDE_WORKSPACE", "Đường dẫn không hợp lệ hoặc nằm ngoài workspace.")
    return target


def tree(db: Session, ws: Workspace) -> list[dict]:
    out: list[dict] = []

    def walk(base: Path, prefix: str, readonly: bool):
        try:
            entries = sorted(base.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
        except FileNotFoundError:
            return
        for e in entries:
            if len(out) >= MAX_TREE:
                return
            if e.name in HIDDEN or e.is_symlink():
                continue
            rel = f"{prefix}{e.name}"
            if not prefix and e.name == DATA:
                continue  # replaced by the read-only dataset view below
            if e.is_dir():
                out.append({"path": rel, "type": "dir", "readonly": readonly})
                walk(e, rel + "/", readonly)
            else:
                out.append({"path": rel, "type": "file", "size": e.stat().st_size, "readonly": readonly})

    walk(root_of(ws), "", False)
    dr = data_root(db, ws)
    if dr:
        out.append({"path": DATA, "type": "dir", "readonly": True})
        walk(dr, DATA + "/", True)
    return out


def read_text(db: Session, ws: Workspace, rel: str) -> dict:
    p = resolve(db, ws, rel)
    if not p.is_file():
        raise not_found("Tệp")
    size = p.stat().st_size
    if size > MAX_TEXT:
        return {"path": rel, "binary": True, "size": size, "too_large": True}
    data = p.read_bytes()
    if b"\0" in data[:8192]:
        return {"path": rel, "binary": True, "size": size}
    try:
        return {"path": rel, "binary": False, "size": size, "content": data.decode("utf-8")}
    except UnicodeDecodeError:
        return {"path": rel, "binary": True, "size": size}


def write_text(db: Session, ws: Workspace, rel: str, content: str) -> dict:
    data = content.encode("utf-8")
    if len(data) > MAX_TEXT:
        raise bad_request("FILE_TOO_LARGE", "Tệp vượt quá 2 MB; hãy dùng chức năng tải lên.")
    p = resolve(db, ws, rel, for_write=True)
    if p.is_dir():
        raise bad_request("IS_DIRECTORY", "Đường dẫn là thư mục.")
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".cole-tmp")
    tmp.write_bytes(data)
    tmp.replace(p)
    return {"path": rel, "size": len(data)}


def write_bytes(db: Session, ws: Workspace, rel: str, data: bytes) -> dict:
    if len(data) > MAX_UPLOAD:
        raise bad_request("SIZE_EXCEEDED", "Tệp vượt quá giới hạn 200 MB.")
    p = resolve(db, ws, rel, for_write=True)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return {"path": rel, "size": len(data)}


def mkdir(db: Session, ws: Workspace, rel: str) -> dict:
    resolve(db, ws, rel, for_write=True).mkdir(parents=True, exist_ok=True)
    return {"path": rel}


def rename(db: Session, ws: Workspace, src: str, dst: str) -> dict:
    a = resolve(db, ws, src, for_write=True)
    b = resolve(db, ws, dst, for_write=True)
    if not a.exists():
        raise not_found("Tệp")
    if b.exists():
        raise bad_request("TARGET_EXISTS", "Đã tồn tại tệp/thư mục cùng tên.")
    b.parent.mkdir(parents=True, exist_ok=True)
    a.rename(b)
    return {"from": src, "to": dst}


def delete(db: Session, ws: Workspace, rel: str) -> dict:
    p = resolve(db, ws, rel, for_write=True)
    if p == root_of(ws):
        raise bad_request("CANNOT_DELETE_ROOT", "Không thể xóa thư mục gốc.")
    if p.is_dir():
        shutil.rmtree(p)
    elif p.exists():
        p.unlink()
    else:
        raise not_found("Tệp")
    return {"path": rel}


def get_steps_progress(db: Session, ws: Workspace) -> list[dict]:
    from cole_platform.modules.assignments.models import AssignmentVersion
    av = db.get(AssignmentVersion, ws.assignment_version_id)
    rubric = av.rubric if av and av.rubric else []

    rows = db.scalars(
        select(WorkspaceStepProgress).where(WorkspaceStepProgress.workspace_id == ws.id)
    ).all()
    progress_map = {r.step_id: r for r in rows}

    out = []
    for idx, item in enumerate(rubric):
        sid = item.get("id") or f"step_{idx+1}"
        prog = progress_map.get(sid)
        out.append({
            "step_id": sid,
            "status": prog.status if prog else "not_started",
            "hints_unlocked_level": prog.hints_unlocked_level if prog else 0,
            "time_spent_seconds": prog.time_spent_seconds if prog else 0,
            "meta": prog.meta if prog else {},
            "updated_at": prog.updated_at.isoformat() if prog and prog.updated_at else None,
        })
    return out


def update_step_progress(
    db: Session,
    ws: Workspace,
    step_id: str,
    status: str,
    time_spent_seconds: int | None = None,
    meta: dict | None = None,
) -> dict:
    prog = db.scalar(
        select(WorkspaceStepProgress).where(
            WorkspaceStepProgress.workspace_id == ws.id,
            WorkspaceStepProgress.step_id == step_id,
        )
    )
    if not prog:
        prog = WorkspaceStepProgress(
            id=new_id("wsp"),
            workspace_id=ws.id,
            step_id=step_id,
            status=status,
            time_spent_seconds=time_spent_seconds or 0,
            meta=meta or {},
        )
        db.add(prog)
    else:
        prog.status = status
        if time_spent_seconds is not None:
            prog.time_spent_seconds += time_spent_seconds
        if meta:
            prog.meta = {**prog.meta, **meta}
    db.commit()
    return {
        "step_id": prog.step_id,
        "status": prog.status,
        "hints_unlocked_level": prog.hints_unlocked_level,
        "time_spent_seconds": prog.time_spent_seconds,
        "meta": prog.meta,
    }


def unlock_step_hint(db: Session, ws: Workspace, step_id: str, level: int) -> dict:
    prog = db.scalar(
        select(WorkspaceStepProgress).where(
            WorkspaceStepProgress.workspace_id == ws.id,
            WorkspaceStepProgress.step_id == step_id,
        )
    )
    if not prog:
        prog = WorkspaceStepProgress(
            id=new_id("wsp"),
            workspace_id=ws.id,
            step_id=step_id,
            status="in_progress",
            hints_unlocked_level=level,
        )
        db.add(prog)
    else:
        if level > prog.hints_unlocked_level:
            prog.hints_unlocked_level = level
    db.commit()
    return {
        "step_id": prog.step_id,
        "status": prog.status,
        "hints_unlocked_level": prog.hints_unlocked_level,
        "time_spent_seconds": prog.time_spent_seconds,
    }


def get_class_progress(db: Session, p: Principal, assignment_id: str) -> dict:
    from cole_platform.kernel.rbac import can_manage_course
    from cole_platform.modules.assignments.models import Assignment, AssignmentVersion
    from cole_platform.modules.identity.models import User

    a = db.get(Assignment, assignment_id)
    if not a:
        raise not_found("Assignment")
    if not can_manage_course(db, p, a.course_id):
        from cole_platform.kernel.errors import forbidden
        raise forbidden()

    av = db.scalar(select(AssignmentVersion).where(AssignmentVersion.assignment_id == a.id).order_by(AssignmentVersion.version.desc()))
    rubric = av.rubric if av and av.rubric else []

    workspaces = db.scalars(
        select(Workspace).where(Workspace.assignment_id == a.id)
    ).all()

    learners = []
    for ws in workspaces:
        user = db.get(User, ws.user_id)
        progs = db.scalars(
            select(WorkspaceStepProgress).where(WorkspaceStepProgress.workspace_id == ws.id)
        ).all()
        pmap = {pr.step_id: pr for pr in progs}

        steps_out = []
        for idx, item in enumerate(rubric):
            sid = item.get("id") or f"step_{idx+1}"
            pr = pmap.get(sid)
            steps_out.append({
                "step_id": sid,
                "title": item.get("title", f"Bước {idx+1}"),
                "status": pr.status if pr else "not_started",
                "hints_unlocked_level": pr.hints_unlocked_level if pr else 0,
                "time_spent_seconds": pr.time_spent_seconds if pr else 0,
            })

        learners.append({
            "workspace_id": ws.id,
            "user_id": ws.user_id,
            "user_name": user.name if user else ws.user_id,
            "email": user.email if user else "",
            "last_active_at": ws.last_active_at.isoformat() if ws.last_active_at else None,
            "steps": steps_out,
            "passed_count": sum(1 for s in steps_out if s["status"] == "passed"),
            "total_count": len(steps_out),
        })

    return {
        "assignment_id": a.id,
        "title": a.title,
        "rubric_steps": rubric,
        "learners": learners,
        "total_learners": len(learners),
    }


def scaffold_workspace(db: Session, ws: Workspace, files: list[str]) -> dict:
    created = []
    for f in files:
        rel = f.strip().strip("/")
        if not rel:
            continue
        try:
            target = resolve(db, ws, rel, for_write=True)
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                ext = target.suffix.lower()
                starter = ""
                if ext == ".py":
                    starter = f'"""\nTệp: {rel}\nKhởi tạo theo cấu trúc chuẩn của bài thực hành.\n"""\n\n'
                elif ext == ".json":
                    starter = "{}\n"
                elif ext in [".yaml", ".yml"]:
                    starter = "# Configuration file\n"
                elif ext == ".txt":
                    starter = f"# {rel}\n"
                target.write_text(starter, encoding="utf-8")
                created.append(rel)
        except Exception:
            pass
    return {"status": "ok", "created": created}


def ai_tutor_consult(
    db: Session,
    ws: Workspace,
    step_id: str,
    question: str,
    active_file: str | None = None,
    current_code: str | None = None,
    tree_files: list[str] | None = None,
) -> dict:
    from cole_platform.modules.assignments.models import AssignmentVersion
    av = db.get(AssignmentVersion, ws.assignment_version_id)
    rubric = av.rubric if av and av.rubric else []

    # Identify all required files across all rubric items
    all_required_files = []
    for item in rubric:
        rf = item.get("required_files") or []
        if isinstance(rf, str):
            rf = [s.strip() for s in rf.split(",") if s.strip()]
        for f in rf:
            if f not in all_required_files:
                all_required_files.append(f)

    # Check current step
    is_step_0 = step_id in ["step_0", "step_0_scaffold", "scaffold"]
    target_step = None
    step_index = 0
    if not is_step_0:
        for idx, item in enumerate(rubric):
            sid = item.get("id") or f"step_{idx+1}"
            if sid == step_id:
                target_step = item
                step_index = idx + 1
                break

    # Analyze file tree status
    tree_set = set(tree_files or [])
    missing_files = [f for f in all_required_files if f not in tree_set and not any(t.endswith(f) for t in tree_set)]

    reply_lines = []
    recommendations = []

    q_lower = (question or "").lower()
    if is_step_0 or ("cấu trúc" in q_lower or "thư mục" in q_lower or "file" in q_lower or "tạo" in q_lower):
        reply_lines.append("📁 **Hướng dẫn Bước 0: Thiết lập cấu trúc thư mục & tệp dự án**")
        if missing_files:
            reply_lines.append(f"Hiện tại dự án còn thiếu **{len(missing_files)}** tệp/thư mục cần thiết theo quy định của giáo viên:")
            for mf in missing_files:
                reply_lines.append(f"- `○ {mf}` (chưa tạo)")
            reply_lines.append("\n👉 Bạn có thể bấm nút **'⚡ Tạo nhanh khung cấu trúc'** hoặc dùng thanh công cụ Explorer bên trái để tạo các tệp này.")
            recommendations.append("Bấm 'Tạo nhanh khung cấu trúc' để hoàn thành Bước 0")
        else:
            reply_lines.append("✅ **Tuyệt vời! Cấu trúc thư mục của bạn đã đầy đủ 100%.**")
            if rubric:
                first_step = rubric[0]
                reply_lines.append(f"\nBây giờ hãy chuyển sang **Việc 1: {first_step.get('title', 'Bước 1')}**.")
                recommendations.append(f"Bắt đầu Việc 1: {first_step.get('title')}")

    elif target_step:
        stitle = target_step.get("title", f"Bước {step_index}")
        stool = target_step.get("tool", "Quy chuẩn")
        req_kw = target_step.get("required_keywords", [])
        if isinstance(req_kw, str):
            req_kw = [s.strip() for s in req_kw.split(",") if s.strip()]
        req_f = target_step.get("required_files", [])
        if isinstance(req_f, str):
            req_f = [s.strip() for s in req_f.split(",") if s.strip()]

        reply_lines.append(f"🎯 **Việc {step_index}: {stitle}** (Công cụ: `{stool}`)")
        if target_step.get("mentor_hint"):
            reply_lines.append(f"\n💬 *Lời dặn của giáo viên:* \"{target_step.get('mentor_hint')}\"")

        # Code inspection
        code = current_code or ""
        missing_kw = [kw for kw in req_kw if kw.lower() not in code.lower()]
        passed_kw = [kw for kw in req_kw if kw.lower() in code.lower()]

        if req_f and active_file and not any(active_file.endswith(rf) for rf in req_f):
            reply_lines.append(f"\n⚠️ **Lưu ý tệp:** Bạn đang mở `{active_file}`. Giáo viên yêu cầu thực hiện bước này trên `{req_f[0]}`. Hãy mở đúng tệp nhé!")
            recommendations.append(f"Mở tệp {req_f[0]}")

        if missing_kw:
            reply_lines.append(f"\n🔍 **Tiêu chuẩn cần bổ sung trong mã nguồn:**")
            for m in missing_kw:
                reply_lines.append(f"- Cần định nghĩa/gọi hàm: `{m}`")
            if passed_kw:
                reply_lines.append(f"\nĐã có sẵn: " + ", ".join(f"`{k}`" for k in passed_kw))
        else:
            reply_lines.append("\n🎉 **Code của bạn đã chứa đầy đủ các hàm/từ khóa quy định!** Hãy lưu tệp và chạy thử nghiệm Simulator để kiểm tra độ chính xác.")

        hints = target_step.get("hints", [])
        h1 = next((h.get("content") for h in hints if h.get("level") == 1), None)
        if h1:
            reply_lines.append(f"\n💡 **Gợi ý định hướng (Level 1):** {h1}")

    else:
        reply_lines.append("🤖 Tôi là Trợ giảng AI đồng hành. Tôi sẽ theo sát mã nguồn và tệp của bạn theo đúng lộ trình do giáo viên thiết kế.")
        reply_lines.append("Hãy chọn một bước cụ thể hoặc đặt câu hỏi về mã nguồn/tiêu chí thực hành!")

    return {
        "reply": "\n".join(reply_lines),
        "step_id": step_id,
        "recommendations": recommendations,
        "missing_files": missing_files,
    }

