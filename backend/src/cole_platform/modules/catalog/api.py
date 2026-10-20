from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from cole_platform.kernel.auth import Principal, current_user
from cole_platform.kernel.db import get_db

from . import service

router = APIRouter(tags=["catalog"])


def _course_out(db: Session, c, role: str | None = None) -> dict:
    return {"id": c.id, "track": c.track, "slug": c.slug, "title": c.title, "status": c.status,
            "execution_status": c.execution_status, "role": role, "stats": service.course_stats(db, c.id)}


@router.get("/courses")
def list_courses(p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    from cole_platform.kernel.rbac import course_role

    return [_course_out(db, c, course_role(db, p, c.id)) for c in service.visible_courses(db, p)]


@router.get("/courses/{course_id}")
def get_course(course_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    c, role = service.get_course_for(db, p, course_id)
    out = _course_out(db, c, role)
    out["modules"] = service.course_tree(db, c.id)
    try:
        from cole_platform.modules.assignments import service as asg

        out["assignments"] = asg.list_for_course(db, p, c.id, role)
    except ImportError:
        out["assignments"] = []
    return out
