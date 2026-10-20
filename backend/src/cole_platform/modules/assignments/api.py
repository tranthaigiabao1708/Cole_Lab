import mimetypes

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from cole_platform.kernel.auth import Principal, current_user
from cole_platform.kernel.db import get_db

from . import service

router = APIRouter(prefix="/assignments", tags=["assignments"])


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
