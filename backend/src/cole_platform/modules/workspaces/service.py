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

from .models import Workspace

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
