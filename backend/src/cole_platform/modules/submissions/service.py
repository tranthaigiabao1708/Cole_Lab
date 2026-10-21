from __future__ import annotations

import gzip
import hashlib
import io
import tarfile
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from cole_platform.kernel.audit import audit
from cole_platform.kernel.auth import Principal
from cole_platform.kernel.errors import AppError, bad_request, not_found
from cole_platform.kernel.ids import new_id
from cole_platform.kernel.storage import storage
from cole_platform.modules.workspaces import service as wsvc
from cole_platform.modules.workspaces.models import Workspace

from . import validation
from .models import Artifact, Submission

SNAPSHOT_EXCLUDE = {"data", ".local", "__pycache__", ".cache", ".ipynb_checkpoints", ".git", "node_modules",
                    ".bash_history", ".python_history"}
MAX_SNAPSHOT = 500 * 1024 * 1024


def _av(db: Session, ws: Workspace):
    from cole_platform.modules.assignments.models import Assignment, AssignmentVersion

    return db.get(Assignment, ws.assignment_id), db.get(AssignmentVersion, ws.assignment_version_id)


def assignment_ref(a, av) -> str:
    return f"{a.slug}@{av.version}"


def normalize_manifest(a, av, manifest: dict) -> dict:
    m = {"manifest": "submission/v1", "assignment": assignment_ref(a, av)}
    m["mode"] = manifest.get("mode")
    def _norm_art(v):
        if isinstance(v, dict):
            return {kk: vv for kk, vv in v.items() if kk in ("path", "entry", "command") and vv}
        if isinstance(v, str):
            v = v.strip()
            return {"entry": v} if ":" in v else {"path": v}
        return {}
    m["artifacts"] = {k: _norm_art(v) for k, v in (manifest.get("artifacts") or {}).items()}
    return m


def put_manifest(db: Session, p: Principal, ws_id: str, manifest: dict) -> dict:
    ws = wsvc.get_owned(db, p, ws_id, write=True)
    a, av = _av(db, ws)
    ws.manifest = normalize_manifest(a, av, manifest)
    db.commit()
    return validate_ws(db, ws)


def validate_ws(db: Session, ws: Workspace) -> dict:
    a, av = _av(db, ws)
    m = ws.manifest or {}
    if not m.get("assignment"):
        m = normalize_manifest(a, av, m)
    report = validation.validate(av.contract, m, wsvc.root_of(ws), assignment_ref(a, av))
    return {"manifest": m, "report": report}


def _snapshot(root: Path) -> tuple[bytes, int]:
    files = []
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root)
        if set(rel.parts) & SNAPSHOT_EXCLUDE or p.is_symlink() or not p.is_file() or p.suffix == ".pyc":
            continue
        if p.name.endswith(".cole-tmp"):
            continue
        files.append((rel.as_posix(), p))
    total = sum(p.stat().st_size for _, p in files)
    if total > MAX_SNAPSHOT:
        raise bad_request("SNAPSHOT_TOO_LARGE", f"Bài nộp {total // 1048576} MB vượt giới hạn 500 MB.")
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as gz, tarfile.open(fileobj=gz, mode="w") as tar:
        for rel, p in files:
            data = p.read_bytes()
            ti = tarfile.TarInfo(rel)
            ti.size, ti.mtime, ti.mode, ti.uid, ti.gid = len(data), 0, 0o644, 1000, 1000
            tar.addfile(ti, io.BytesIO(data))
    return buf.getvalue(), len(files)


def submit(db: Session, p: Principal, ws_id: str, manifest: dict | None = None) -> Submission:
    ws = wsvc.get_owned(db, p, ws_id, write=True)
    a, av = _av(db, ws)
    if manifest is not None:
        ws.manifest = normalize_manifest(a, av, manifest)
    res = validate_ws(db, ws)
    report = res["report"]
    if report["status"] != "valid":
        raise AppError(422, "SUBMISSION_INVALID", "Bài nộp chưa hợp lệ. Xem danh sách lỗi.", {"report": report})
    root = wsvc.root_of(ws)
    data, nfiles = _snapshot(root)
    key, sha, size = storage.put_bytes("private", data)
    seq = (db.scalar(select(func.max(Submission.seq)).where(Submission.workspace_id == ws.id)) or 0) + 1
    sub = Submission(id=new_id("sub"), workspace_id=ws.id, user_id=p.id, assignment_id=a.id,
                     assignment_version_id=av.id, seq=seq, snapshot_key=key, sha256=sha, size=size,
                     file_count=nfiles, manifest=res["manifest"], validation_status="valid",
                     validation_report=report)
    db.add(sub)
    db.flush()
    for k, art in report["artifacts"].items():
        meta = {kk: vv for kk, vv in art.items() if kk not in ("kind", "path", "format", "size")}
        sha_a = None
        if art.get("path"):
            sha_a = hashlib.sha256((root / art["path"]).read_bytes()).hexdigest()
        db.add(Artifact(id=new_id("art"), submission_id=sub.id, key=k, kind=art["kind"], path=art.get("path"),
                        format=art.get("format"), sha256=sha_a, size=art.get("size"), meta=meta))
    audit(db, "submission.create", actor_id=p.id, target_type="submission", target_id=sub.id,
          meta={"assignment": a.slug, "seq": seq, "sha256": sha})
    db.commit()
    return sub


def sub_out(db: Session, s: Submission, with_runs: bool = True) -> dict:
    out = {"id": s.id, "seq": s.seq, "workspace_id": s.workspace_id, "assignment_id": s.assignment_id,
           "user_id": s.user_id, "sha256": s.sha256, "size": s.size, "file_count": s.file_count,
           "manifest": s.manifest, "validation_status": s.validation_status,
           "validation_report": s.validation_report, "plugin_validation": s.plugin_validation,
           "submitted_at": s.submitted_at.isoformat()}
    from cole_platform.modules.assignments.models import Assignment

    a = db.get(Assignment, s.assignment_id)
    out["assignment"] = {"id": a.id, "slug": a.slug, "title": a.title} if a else None
    if with_runs:
        try:
            from cole_platform.modules.runs.service import runs_for_submission

            out["runs"] = runs_for_submission(db, s.id)
        except ImportError:
            out["runs"] = []
    return out


def get_visible(db: Session, p: Principal, sub_id: str) -> Submission:
    from cole_platform.kernel.rbac import can_manage_course
    from cole_platform.modules.assignments.models import Assignment

    s = db.get(Submission, sub_id)
    if not s:
        raise not_found("Bài nộp")
    if s.user_id == p.id:
        return s
    a = db.get(Assignment, s.assignment_id)
    if a and can_manage_course(db, p, a.course_id):
        return s
    raise not_found("Bài nộp")


def list_subs(db: Session, p: Principal, assignment_id: str | None = None, all_users: bool = False) -> list[dict]:
    from cole_platform.kernel.rbac import can_manage_course
    from cole_platform.modules.assignments.models import Assignment

    q = select(Submission)
    if assignment_id:
        q = q.where(Submission.assignment_id == assignment_id)
        a = db.get(Assignment, assignment_id)
        if not (all_users and a and can_manage_course(db, p, a.course_id)):
            q = q.where(Submission.user_id == p.id)
    else:
        q = q.where(Submission.user_id == p.id)
    rows = db.scalars(q.order_by(Submission.submitted_at.desc()).limit(200)).all()
    return [sub_out(db, s) for s in rows]
