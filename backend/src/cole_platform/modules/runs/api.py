from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from cole_platform.kernel.auth import Principal, current_user, require_admin
from cole_platform.kernel.db import get_db

from . import service

router = APIRouter(tags=["runs"])


@router.post("/submissions/{sub_id}/run")
def trigger_run(sub_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    run = service.enqueue_run(db, p, sub_id, mode="run")
    return {"id": run.id, "status": run.status, "mode": run.mode}


@router.get("/runs/{run_id}")
def get_run(run_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return service.get_run_detail(db, p, run_id)


@router.post("/runs/{run_id}/cancel")
def cancel_run(run_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    r = service.cancel_run(db, p, run_id)
    return {"id": r.id, "status": r.status}


@router.get("/admin/runs/cost-summary")
def cost_summary(p: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    return service.cost_summary(db)
