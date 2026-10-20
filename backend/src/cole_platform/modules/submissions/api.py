from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from cole_platform.kernel.auth import Principal, current_user
from cole_platform.kernel.db import get_db
from cole_platform.modules.workspaces import service as wsvc

from . import service

router = APIRouter(tags=["submissions"])


class ManifestIn(BaseModel):
    manifest: dict


@router.get("/workspaces/{ws_id}/manifest")
def get_manifest(ws_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return service.validate_ws(db, wsvc.get_owned(db, p, ws_id))


@router.put("/workspaces/{ws_id}/manifest")
def put_manifest(ws_id: str, body: ManifestIn, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return service.put_manifest(db, p, ws_id, body.manifest)


class SubmitIn(BaseModel):
    manifest: dict | None = None


@router.post("/workspaces/{ws_id}/submit")
def submit(ws_id: str, body: SubmitIn, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    s = service.submit(db, p, ws_id, body.manifest)
    out = service.sub_out(db, s)
    try:
        from cole_platform.modules.runs.service import enqueue_validate_submission

        enqueue_validate_submission(db, p, s)
    except ImportError:
        pass
    return out


@router.get("/submissions")
def list_submissions(assignment_id: str | None = None, all: bool = False, p: Principal = Depends(current_user),
                     db: Session = Depends(get_db)):
    return service.list_subs(db, p, assignment_id, all)


@router.get("/submissions/{sub_id}")
def get_submission(sub_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return service.sub_out(db, service.get_visible(db, p, sub_id))
