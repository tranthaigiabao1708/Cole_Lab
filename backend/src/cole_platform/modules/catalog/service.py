from sqlalchemy import func, select
from sqlalchemy.orm import Session

from cole_platform.kernel.auth import Principal
from cole_platform.kernel.errors import bad_request, not_found
from cole_platform.kernel.ids import new_id
from cole_platform.kernel.rbac import course_role

from .models import Course, Lesson, Module

# Only AI Engineer has execution features in the POC (R-02/R-03).
EXECUTION_TRACKS = {"AI_ENGINEER"}


def create_course_from_tree(db: Session, p: Principal, track: str, title: str, slug: str, tree: dict,
                            source_import_id: str | None = None) -> Course:
    from cole_platform.modules.identity.models import CourseMembership

    if db.scalar(select(Course).where(Course.slug == slug)):
        raise bad_request("SLUG_TAKEN", "Mã khóa học đã tồn tại.")
    course = Course(id=new_id("crs"), org_id=p.org_id, track=track, slug=slug, title=title[:300],
                    status="published",
                    execution_status="active" if track in EXECUTION_TRACKS else "planned",
                    source_import_id=source_import_id)
    db.add(course)
    db.flush()
    for mi, m in enumerate(tree["modules"], start=1):
        mod = Module(id=new_id("mod"), course_id=course.id, order=mi, code=m["code"], title=m["title"][:300],
                     group_path=(m.get("group_path") or None), objectives=m.get("objectives") or None)
        db.add(mod)
        db.flush()
        for li, ls in enumerate(m["lessons"], start=1):
            db.add(Lesson(id=new_id("les"), module_id=mod.id, order=li, label=(ls.get("label") or "")[:80],
                          session_numbers=ls.get("session_numbers") or [], title=ls["title"][:500],
                          content=ls.get("content") or None, objectives=ls.get("objectives") or None,
                          practice=ls.get("practice") or None, practice_candidate=bool(ls.get("practice_candidate")),
                          kind=ls.get("kind") or "session"))
    if not p.is_admin:
        db.add(CourseMembership(id=new_id("mem"), user_id=p.id, course_id=course.id, role_in_course="teacher"))
    return course


def visible_courses(db: Session, p: Principal) -> list[Course]:
    from cole_platform.modules.identity.models import CourseMembership

    q = select(Course).where(Course.org_id == p.org_id)
    if not p.is_admin:
        q = q.join(CourseMembership, CourseMembership.course_id == Course.id).where(CourseMembership.user_id == p.id)
        if not p.is_teacher:
            q = q.where(Course.status == "published")
    return list(db.scalars(q.order_by(Course.track, Course.created_at)).all())


def course_stats(db: Session, course_id: str) -> dict:
    mods = db.scalar(select(func.count(Module.id)).where(Module.course_id == course_id)) or 0
    lessons = db.scalars(select(Lesson).join(Module).where(Module.course_id == course_id)).all()
    sessions = {n for ls in lessons for n in (ls.session_numbers or [])}
    return {"modules": mods, "lessons": len(lessons), "sessions": len(sessions),
            "practice_candidates": sum(1 for ls in lessons if ls.practice_candidate)}


def get_course_for(db: Session, p: Principal, course_id: str) -> tuple[Course, str]:
    c = db.get(Course, course_id)
    if not c or c.org_id != p.org_id:
        raise not_found("Khóa học")
    role = course_role(db, p, c.id)
    if role is None or (role == "student" and c.status != "published"):
        raise not_found("Khóa học")
    return c, role


def course_tree(db: Session, course_id: str) -> list[dict]:
    mods = db.scalars(select(Module).where(Module.course_id == course_id).order_by(Module.order)).all()
    out = []
    for m in mods:
        lessons = db.scalars(select(Lesson).where(Lesson.module_id == m.id).order_by(Lesson.order)).all()
        out.append({
            "id": m.id, "order": m.order, "code": m.code, "title": m.title, "group_path": m.group_path,
            "objectives": m.objectives,
            "lessons": [{"id": ls.id, "order": ls.order, "label": ls.label, "session_numbers": ls.session_numbers,
                         "title": ls.title, "content": ls.content, "objectives": ls.objectives,
                         "practice": ls.practice, "practice_candidate": ls.practice_candidate, "kind": ls.kind}
                        for ls in lessons],
        })
    return out
