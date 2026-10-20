"""Seed a local dev database: org, 3 users, 3 courses imported from the real Excel syllabi.

Usage: python -m cole_platform.seed [--reset]
Dev credentials (local only): admin@cole.local / teacher@cole.local / student@cole.local, password `ColeDev!2026`.
"""
import sys

from sqlalchemy import select

from cole_platform.kernel.auth import Principal, hash_password
from cole_platform.kernel.config import REPO_ROOT, settings
from cole_platform.kernel.db import Base, SessionLocal, engine, init_db
from cole_platform.kernel.ids import new_id
from cole_platform.modules.catalog.models import Course
from cole_platform.modules.identity.models import CourseMembership, Organization, User
from cole_platform.modules.syllabus_import import service as imports

DEV_PASSWORD = "ColeDev!2026"
COURSES = [
    ("AI.xlsx", "ai", "AI_ENGINEER", "ai-engineer-2026", "AI Engineer Fullstack 2026"),
    ("DE.xlsx", "de", "DATA_ENGINEER", "data-engineer", "Data Engineer"),
    ("BA.xlsx", "ba", "BUSINESS_ANALYST", "business-analyst", "IT Business Analyst"),
]


def find_source(name: str):
    for p in (settings.content_dir / "syllabus-sources" / name, REPO_ROOT / name):
        if p.exists():
            return p
    raise FileNotFoundError(name)


def run(reset: bool = False) -> None:
    if reset:
        from cole_platform import models_registry  # noqa: F401

        Base.metadata.drop_all(engine)
    init_db()
    db = SessionLocal()
    try:
        org = db.scalar(select(Organization))
        if not org:
            org = Organization(id=new_id("org"), name="Trung tâm đào tạo (dev)", settings={})
            db.add(org)
            db.flush()
        users = {}
        for role, name in (("admin", "Quản trị viên"), ("teacher", "Giảng viên Demo"), ("student", "Học viên Demo")):
            email = f"{role}@cole.local"
            u = db.scalar(select(User).where(User.email == email))
            if not u:
                u = User(id=new_id("usr"), org_id=org.id, email=email, name=name, role=role,
                         password_hash=hash_password(DEV_PASSWORD))
                db.add(u)
            users[role] = u
        db.commit()

        teacher = users["teacher"]
        tp = Principal(id=teacher.id, org_id=org.id, email=teacher.email, name=teacher.name, role="teacher")
        for fname, preset, track, slug, title in COURSES:
            course = db.scalar(select(Course).where(Course.slug == slug))
            if not course:
                imp = imports.create_import(db, tp, fname, find_source(fname).read_bytes(), preset)
                course_id = imports.publish(db, tp, imp.id, track, title, slug)
                course = db.get(Course, course_id)
            if not db.scalar(select(CourseMembership).where(CourseMembership.user_id == users["student"].id,
                                                            CourseMembership.course_id == course.id)):
                db.add(CourseMembership(id=new_id("mem"), user_id=users["student"].id, course_id=course.id,
                                        role_in_course="student"))
        db.commit()
        try:
            from cole_platform.seed_assignments import seed_assignments

            seed_assignments(db)
        except ImportError:
            pass
        try:
            from cole_platform.modules.plugins import service as plug_svc

            plug_svc.scan_and_register(db)
            plug_svc.sync_images(db)
        except ImportError:
            pass
        print("Seed OK. Users: admin/teacher/student@cole.local, password:", DEV_PASSWORD)
    finally:
        db.close()


if __name__ == "__main__":
    run(reset="--reset" in sys.argv)
