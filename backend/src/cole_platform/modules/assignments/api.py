import mimetypes

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from cole_platform.kernel.auth import Principal, current_user, require_teacher
from cole_platform.kernel.db import get_db

from . import service

router = APIRouter(prefix="/assignments", tags=["assignments"])


class CreateAssignmentIn(BaseModel):
    course_id: str
    lesson_id: str | None = None
    title: str = Field(..., min_length=3, max_length=300)
    slug: str = Field(..., min_length=3, max_length=80)
    plugin_id: str = "cole.cv-ok-ng"
    assignment_type: str = "lab"
    readme: str = ""
    run_command: str | None = None
    starter_code: str | None = None
    timeout_s: int = 180
    rubric: list[dict] = Field(default_factory=list)


@router.post("")
def create_assignment(body: CreateAssignmentIn, p: Principal = Depends(require_teacher), db: Session = Depends(get_db)):
    return service.create_assignment(db, p, body.model_dump())



@router.get("/{assignment_id}")
def get_assignment(assignment_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return service.detail(db, p, assignment_id)


@router.get("/{assignment_id}/docs/{name:path}")
def get_doc(assignment_id: str, name: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    fname, data = service.doc_bytes(db, p, assignment_id, name)
    mime = mimetypes.guess_type(fname)[0] or "application/octet-stream"
    if fname.endswith(".md"):
        mime = "text/markdown; charset=utf-8"
    return Response(data, media_type=mime, headers={"X-Content-Type-Options": "nosniff"})


@router.get("/{assignment_id}/testcases")
def get_cases(assignment_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return service.list_cases(db, p, assignment_id)
