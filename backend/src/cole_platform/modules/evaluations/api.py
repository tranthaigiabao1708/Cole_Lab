from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from cole_platform.kernel.auth import get_current_user
from cole_platform.kernel.db import get_db
from cole_platform.kernel.errors import AppError
from cole_platform.modules.identity.models import UserAccount
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
    user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        ev = service.save_evaluation(
            db=db,
            user_id=user.id,
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
    except AppError as e:
        raise HTTPException(status_code=e.status_code, detail={"code": e.code, "message": e.message})


@router.get("/runs/{run_id}/evaluations")
def get_evaluations(
    run_id: str,
    user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.get_evaluations_for_run(db, run_id)
