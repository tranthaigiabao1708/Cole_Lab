from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from cole_platform.kernel.auth import Principal, require_teacher
from cole_platform.kernel.db import get_db

from . import parser, service

router = APIRouter(prefix="/teach/imports", tags=["syllabus-import"])


def _out(imp, full: bool = True) -> dict:
    d = {"id": imp.id, "filename": imp.filename, "sha256": imp.sha256, "sheet": imp.sheet, "preset": imp.preset,
         "status": imp.status, "course_id": imp.course_id, "created_at": imp.created_at.isoformat(),
         "stats": imp.parsed.get("stats"), "course_title": imp.parsed.get("course_title")}
    if full:
        d.update(profile=imp.profile, rows=imp.parsed["rows"], modules=imp.parsed["modules"],
                 warnings=imp.parsed["warnings"])
    return d


@router.get("/presets")
def presets(p: Principal = Depends(require_teacher)):
    return {k: {"label": v["label"], "profile": parser.preset(k)} for k, v in parser.PRESETS.items()}


@router.get("")
def list_imports(p: Principal = Depends(require_teacher), db: Session = Depends(get_db)):
    return [_out(i, full=False) for i in service.list_imports(db, p)]


@router.post("")
async def upload(file: UploadFile = File(...), preset: str | None = Form(None),
                 p: Principal = Depends(require_teacher), db: Session = Depends(get_db)):
    data = await file.read(service.MAX_BYTES + 1)
    return _out(service.create_import(db, p, file.filename or "upload.xlsx", data, preset or None))


@router.get("/{import_id}")
def get_import(import_id: str, p: Principal = Depends(require_teacher), db: Session = Depends(get_db)):
    return _out(service.get_import(db, p, import_id))


class ProfileIn(BaseModel):
    profile: dict
    sheet: str | None = None


@router.put("/{import_id}/profile")
def put_profile(import_id: str, body: ProfileIn, p: Principal = Depends(require_teacher), db: Session = Depends(get_db)):
    return _out(service.reparse(db, p, import_id, body.profile, body.sheet))


class RowsIn(BaseModel):
    changes: list[dict]


@router.patch("/{import_id}/rows")
def patch_rows(import_id: str, body: RowsIn, p: Principal = Depends(require_teacher), db: Session = Depends(get_db)):
    return _out(service.update_rows(db, p, import_id, body.changes))


class PublishIn(BaseModel):
    track: str
    title: str
    slug: str


@router.post("/{import_id}/publish")
def publish(import_id: str, body: PublishIn, p: Principal = Depends(require_teacher), db: Session = Depends(get_db)):
    return {"course_id": service.publish(db, p, import_id, body.track, body.title, body.slug)}
