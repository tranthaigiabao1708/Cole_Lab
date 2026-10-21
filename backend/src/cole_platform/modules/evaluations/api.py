from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from cole_platform.kernel.auth import Principal, current_user
from cole_platform.kernel.db import get_db
from cole_platform.modules.runs.service import get_run_visible

from . import service

router = APIRouter(tags=["evaluations"])


class SaveEvaluationIn(BaseModel):
    case_key: str
    rating: int = Field(ge=1, le=5)
    feedback: str | None = None
    criteria: dict[str, Any] | None = None


@router.post("/runs/{run_id}/evaluations")
def save_evaluation(
    run_id: str,
    body: SaveEvaluationIn,
    p: Principal = Depends(current_user),
    db: Session = Depends(get_db),
):
    get_run_visible(db, p, run_id)  # 404 when the caller cannot see this run
    ev = service.save_evaluation(
        db=db,
        user_id=p.id,
        run_id=run_id,
        case_key=body.case_key,
        rating=body.rating,
        feedback=body.feedback,
        criteria=body.criteria,
    )
    return {
        "ok": True,
        "evaluation": {
            "id": ev.id,
            "case_key": ev.case_key,
            "rating": ev.rating,
            "feedback": ev.feedback,
        },
    }


@router.get("/runs/{run_id}/evaluations")
def get_evaluations(
    run_id: str,
    p: Principal = Depends(current_user),
    db: Session = Depends(get_db),
):
    get_run_visible(db, p, run_id)
    return service.get_evaluations_for_run(db, run_id)
