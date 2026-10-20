"""Assignment package importer (content/assignments/<slug>/).

Layout:
  assignment.yaml            metadata (see below)
  README.md                  problem statement shown to learners
  docs/                      extra documents (public)
  template/                  project template copied into each new workspace
  dataset/                   optional, mounted read-only at /workspace/data
  testset/cases.jsonl        hidden test cases (answer_key bucket) + testset/files/*
  submission-contract.yaml   what must be submitted
  default-manifest.yaml      where the template puts each artifact
  profile.yaml               simulator profile (validated by the plugin)

Re-importing identical content is a no-op; changed content creates a new published
AssignmentVersion (old versions stay immutable for re-grading).

CLI: python -m cole_platform.modules.assignments.package <dir> [<dir> ...]
"""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import shutil
import sys
import tarfile
from pathlib import Path

import yaml
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from cole_platform.kernel.config import settings
from cole_platform.kernel.db import utcnow
from cole_platform.kernel.ids import new_id
from cole_platform.kernel.storage import storage

from .models import Assignment, AssignmentVersion, TestCase, TestSetVersion

SKIP = {"__pycache__", ".pytest_cache", ".ipynb_checkpoints", ".DS_Store"}
DEFAULT_VISIBILITY = {"input": "after_run", "expected": "hidden", "notes": "visible"}


def _files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    return sorted(p for p in root.rglob("*") if p.is_file() and not (set(p.relative_to(root).parts) & SKIP))


def _dir_sha(root: Path) -> str:
    h = hashlib.sha256()
    for p in _files(root):
        h.update(p.relative_to(root).as_posix().encode() + b"\0")
        h.update(hashlib.sha256(p.read_bytes()).digest())
    return h.hexdigest()


def deterministic_tar(root: Path) -> bytes:
    """tar.gz with fixed mtimes/owners so identical trees hash identically."""
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as gz, tarfile.open(fileobj=gz, mode="w") as tar:
        for p in _files(root):
            data = p.read_bytes()
            ti = tarfile.TarInfo(p.relative_to(root).as_posix())
            ti.size, ti.mtime, ti.mode, ti.uid, ti.gid = len(data), 0, 0o644, 1000, 1000
            tar.addfile(ti, io.BytesIO(data))
    return buf.getvalue()


def _yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8")) if path.is_file() else {}


def _find_lesson(db: Session, course_id: str, spec: dict | None) -> str | None:
    from cole_platform.modules.catalog.models import Lesson, Module

    if not spec:
        return None
    q = select(Lesson).join(Module).where(Module.course_id == course_id)
    if spec.get("module_code"):
        q = q.where(Module.code == spec["module_code"])
    for ls in db.scalars(q.order_by(Module.order, Lesson.order)).all():
        if spec.get("session") in (ls.session_numbers or []):
            return ls.id
        if spec.get("title_contains") and spec["title_contains"].lower() in ls.title.lower():
            return ls.id
    return None


def import_package(db: Session, pkg: Path) -> tuple[Assignment, AssignmentVersion, bool]:
    """Returns (assignment, version, created_new_version)."""
    from cole_platform.modules.catalog.models import Course

    pkg = pkg.resolve()
    meta = _yaml(pkg / "assignment.yaml")
    if not meta.get("slug"):
        raise ValueError(f"{pkg}: assignment.yaml missing slug")
    course = db.scalar(select(Course).where(Course.slug == meta["course"]))
    if not course:
        raise ValueError(f"course {meta['course']!r} not found — import the syllabus first")

    content_sha = _dir_sha(pkg)
    a = db.scalar(select(Assignment).where(Assignment.slug == meta["slug"]))
    if a:
        cur = db.get(AssignmentVersion, a.current_version_id) if a.current_version_id else None
        if cur and cur.content_sha == content_sha:
            return a, cur, False
    else:
        a = Assignment(id=new_id("asg"), course_id=course.id, slug=meta["slug"], title=meta["title"],
                       assignment_type=meta.get("assignment_type", "generic"))
        db.add(a)
        db.flush()
    a.title = meta["title"]
    a.lesson_id = _find_lesson(db, course.id, meta.get("lesson"))

    # template
    tpl = deterministic_tar(pkg / meta.get("template", "template"))
    tpl_key, tpl_sha, _ = storage.put_bytes("private", tpl)

    # docs (public)
    docs = []
    for p in _files(pkg / meta.get("docs", "docs")):
        key, _, size = storage.put_bytes("public", p.read_bytes())
        docs.append({"name": p.relative_to(pkg / meta.get("docs", "docs")).as_posix(), "key": key, "size": size})

    # dataset -> content-addressed directory, mounted read-only into workspaces
    dataset_sha, dataset_info = None, None
    ds_dir = pkg / meta.get("dataset", "dataset")
    if ds_dir.is_dir():
        dataset_sha = _dir_sha(ds_dir)
        dest = settings.datasets_dir / dataset_sha
        if not dest.exists():
            tmp = dest.with_suffix(".tmp")
            shutil.rmtree(tmp, ignore_errors=True)
            shutil.copytree(ds_dir, tmp, ignore=shutil.ignore_patterns(*SKIP))
            tmp.replace(dest)
        files = _files(ds_dir)
        info = _yaml(ds_dir / "DATASET.yaml")
        dataset_info = {"files": len(files), "bytes": sum(p.stat().st_size for p in files),
                        "license": info.get("license"), "description": info.get("description"),
                        "mount": "/workspace/data"}

    # testset (answer_key)
    ts_id = None
    ts_dir = pkg / meta.get("testset", "testset")
    if (ts_dir / "cases.jsonl").is_file():
        ts_sha = _dir_sha(ts_dir)
        ts = db.scalar(select(TestSetVersion).where(TestSetVersion.assignment_id == a.id,
                                                    TestSetVersion.sha256 == ts_sha))
        if not ts:
            key, _, _ = storage.put_bytes("answer_key", deterministic_tar(ts_dir))
            n = (db.scalar(select(func.max(TestSetVersion.version)).where(TestSetVersion.assignment_id == a.id)) or 0) + 1
            lines = [ln for ln in (ts_dir / "cases.jsonl").read_text(encoding="utf-8").splitlines() if ln.strip()]
            ts = TestSetVersion(id=new_id("tsv"), assignment_id=a.id, version=n, sha256=ts_sha, count=len(lines),
                                storage_key=key)
            db.add(ts)
            db.flush()
            vis_default = {**DEFAULT_VISIBILITY, **(meta.get("visibility") or {})}
            for i, ln in enumerate(lines):
                c = json.loads(ln)
                db.add(TestCase(id=new_id("tc"), testset_version_id=ts.id, order=i, case_key=c["key"],
                                input=c.get("input") or {}, expected=c.get("expected"), notes=c.get("notes"),
                                field_visibility={**vis_default, **(c.get("visibility") or {})},
                                tags=c.get("tags") or [], files=c.get("files") or []))
        ts_id = ts.id

    plugin = meta.get("plugin") or {}
    n = (db.scalar(select(func.max(AssignmentVersion.version)).where(AssignmentVersion.assignment_id == a.id)) or 0) + 1
    av = AssignmentVersion(
        id=new_id("asv"), assignment_id=a.id, version=n, status="published", content_sha=content_sha,
        readme=(pkg / meta.get("readme", "README.md")).read_text(encoding="utf-8"),
        docs=docs, template_key=tpl_key, template_sha=tpl_sha, run_command=meta.get("run_command", ""),
        contract=_yaml(pkg / "submission-contract.yaml"), default_manifest=_yaml(pkg / "default-manifest.yaml"),
        plugin_id=plugin.get("id", ""), plugin_version_range=str(plugin.get("version", "*")),
        profile=_yaml(pkg / "profile.yaml"), rubric=meta.get("rubric") or [],
        testset_version_id=ts_id, dataset_sha=dataset_sha, dataset_info=dataset_info,
        limits=meta.get("limits") or {}, published_at=utcnow(),
    )
    db.add(av)
    db.flush()
    a.current_version_id = av.id
    a.status = "published"
    return a, av, True


def import_all(db: Session, root: Path | None = None) -> list[str]:
    root = root or settings.content_dir / "assignments"
    out = []
    for d in sorted(p for p in root.iterdir() if (p / "assignment.yaml").is_file()):
        a, av, new = import_package(db, d)
        out.append(f"{a.slug} v{av.version}{' (new)' if new else ''}")
    db.commit()
    return out


if __name__ == "__main__":
    from cole_platform.kernel.db import SessionLocal, init_db

    init_db()
    with SessionLocal() as s:
        if len(sys.argv) > 1:
            for arg in sys.argv[1:]:
                a, av, new = import_package(s, Path(arg))
                print(f"{a.slug} v{av.version}{' (new)' if new else ' (unchanged)'}")
            s.commit()
        else:
            print("\n".join(import_all(s)))
