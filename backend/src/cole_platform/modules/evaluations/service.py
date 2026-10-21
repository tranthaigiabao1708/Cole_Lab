from typing import Any
from sqlalchemy import select
from sqlalchemy.orm import Session

from cole_platform.kernel.errors import AppError
from cole_platform.kernel.ids import new_id
from .models import Evaluation


def save_evaluation(
    db: Session,
    user_id: str,
    run_id: str,
    case_key: str,
    rating: int,
    feedback: str | None = None,
    criteria: dict[str, Any] | None = None,
) -> Evaluation:
    if rating < 1 or rating > 5:
        raise AppError(400, "INVALID_RATING", "Đánh giá sao phải từ 1 đến 5.")

    stmt = select(Evaluation).where(
        Evaluation.run_id == run_id,
        Evaluation.case_key == case_key,
        Evaluation.user_id == user_id,
    )
    existing = db.scalar(stmt)
    if existing:
        existing.rating = rating
        existing.feedback = feedback
        existing.criteria = criteria
        db.commit()
        db.refresh(existing)
        return existing

    ev = Evaluation(
        id=new_id("evl"),
        run_id=run_id,
        case_key=case_key,
        user_id=user_id,
        rating=rating,
        feedback=feedback,
        criteria=criteria,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def get_evaluations_for_run(db: Session, run_id: str) -> dict[str, Any]:
    stmt = select(Evaluation).where(Evaluation.run_id == run_id)
    items = list(db.scalars(stmt).all())

    count = len(items)
    avg_rating = round(sum(i.rating for i in items) / count, 2) if count > 0 else 0.0
    dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for i in items:
        dist[i.rating] = dist.get(i.rating, 0) + 1

    return {
        "items": [
            {
                "id": i.id,
                "case_key": i.case_key,
                "user_id": i.user_id,
                "rating": i.rating,
                "feedback": i.feedback,
                "criteria": i.criteria,
                "created_at": i.created_at.isoformat() if i.created_at else None,
            }
            for i in items
        ],
        "summary": {
            "evaluated_count": count,
            "average_rating": avg_rating,
            "distribution": dist,
        },
    }
