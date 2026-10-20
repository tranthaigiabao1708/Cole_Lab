"""Course-scoped access checks. Org-scope roles live on User.role."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import Principal
from .errors import forbidden


def course_role(db: Session, p: Principal, course_id: str) -> str | None:
    """Return 'admin' | 'teacher' | 'student' | None for this principal in a course."""
    from cole_platform.modules.identity.models import CourseMembership

    if p.is_admin:
        return "admin"
    m = db.scalar(select(CourseMembership).where(CourseMembership.user_id == p.id,
                                                 CourseMembership.course_id == course_id))
    if m:
        return m.role_in_course
    return None


def can_view_course(db: Session, p: Principal, course_id: str) -> bool:
    return course_role(db, p, course_id) is not None


def can_manage_course(db: Session, p: Principal, course_id: str) -> bool:
    return course_role(db, p, course_id) in ("admin", "teacher")


def ensure_manage_course(db: Session, p: Principal, course_id: str) -> None:
    if not can_manage_course(db, p, course_id):
        raise forbidden()
