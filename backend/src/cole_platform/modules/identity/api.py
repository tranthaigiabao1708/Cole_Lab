from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from cole_platform.kernel.audit import audit
from cole_platform.kernel.auth import (COOKIE_NAME, Principal, create_session, current_user, destroy_session,
                                       hash_password, require_admin, verify_password)
from cole_platform.kernel.config import settings
from cole_platform.kernel.db import get_db
from cole_platform.kernel.errors import AppError, bad_request, not_found
from cole_platform.kernel.ids import new_id

from .models import ROLES, AuditLog, CourseMembership, User

router = APIRouter(tags=["identity"])


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    status: str = "active"


@router.post("/auth/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if not u or u.status != "active" or not verify_password(u.password_hash, body.password):
        audit(db, "auth.login_failed", meta={"email": body.email[:200]},
              ip=request.client.host if request.client else None, commit=True)
        raise AppError(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.")
    token = create_session(db, u.id)
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite="lax", secure=settings.cookie_secure,
                        max_age=settings.session_ttl_hours * 3600, path="/")
    audit(db, "auth.login", actor_id=u.id, ip=request.client.host if request.client else None, commit=True)
    return UserOut(id=u.id, email=u.email, name=u.name, role=u.role, status=u.status)


@router.post("/auth/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    destroy_session(db, request.cookies.get(COOKIE_NAME))
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/auth/me", response_model=UserOut)
def me(p: Principal = Depends(current_user)):
    return UserOut(id=p.id, email=p.email, name=p.name, role=p.role)


# ---- Admin -----------------------------------------------------------------

class UserCreate(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=200)
    name: str = Field(min_length=1, max_length=200)
    role: str
    password: str = Field(min_length=8)


@router.get("/admin/users", response_model=list[UserOut])
def list_users(p: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(User).where(User.org_id == p.org_id).order_by(User.created_at)).all()
    return [UserOut(id=u.id, email=u.email, name=u.name, role=u.role, status=u.status) for u in rows]


@router.post("/admin/users", response_model=UserOut)
def create_user(body: UserCreate, p: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    if body.role not in ROLES:
        raise bad_request("INVALID_ROLE", "Vai trò không hợp lệ.")
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise bad_request("EMAIL_TAKEN", "Email đã được sử dụng.")
    u = User(id=new_id("usr"), org_id=p.org_id, email=email, name=body.name, role=body.role,
             password_hash=hash_password(body.password))
    db.add(u)
    audit(db, "admin.user_create", actor_id=p.id, target_type="user", target_id=u.id, meta={"role": body.role})
    db.commit()
    return UserOut(id=u.id, email=u.email, name=u.name, role=u.role, status=u.status)


class UserPatch(BaseModel):
    role: str | None = None
    status: str | None = None


@router.patch("/admin/users/{user_id}", response_model=UserOut)
def patch_user(user_id: str, body: UserPatch, p: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u or u.org_id != p.org_id:
        raise not_found("Người dùng")
    if body.role:
        if body.role not in ROLES:
            raise bad_request("INVALID_ROLE", "Vai trò không hợp lệ.")
        u.role = body.role
    if body.status:
        if body.status not in ("active", "locked"):
            raise bad_request("INVALID_STATUS", "Trạng thái không hợp lệ.")
        if u.id == p.id and body.status == "locked":
            raise bad_request("SELF_LOCK", "Không thể tự khóa tài khoản của mình.")
        u.status = body.status
    audit(db, "admin.user_update", actor_id=p.id, target_type="user", target_id=u.id, meta=body.model_dump(exclude_none=True))
    db.commit()
    return UserOut(id=u.id, email=u.email, name=u.name, role=u.role, status=u.status)


class MembershipIn(BaseModel):
    user_id: str
    course_id: str
    role_in_course: str


@router.post("/admin/memberships")
def add_membership(body: MembershipIn, p: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    if body.role_in_course not in ("teacher", "student"):
        raise bad_request("INVALID_ROLE", "Vai trò trong khóa học không hợp lệ.")
    existing = db.scalar(select(CourseMembership).where(CourseMembership.user_id == body.user_id,
                                                        CourseMembership.course_id == body.course_id))
    if existing:
        existing.role_in_course = body.role_in_course
    else:
        db.add(CourseMembership(id=new_id("mem"), **body.model_dump()))
    audit(db, "admin.membership_set", actor_id=p.id, target_type="course", target_id=body.course_id,
          meta={"user_id": body.user_id, "role": body.role_in_course})
    db.commit()
    return {"ok": True}


@router.get("/admin/memberships")
def list_memberships(course_id: str | None = None, p: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    q = select(CourseMembership)
    if course_id:
        q = q.where(CourseMembership.course_id == course_id)
    return [{"user_id": m.user_id, "course_id": m.course_id, "role_in_course": m.role_in_course}
            for m in db.scalars(q).all()]


@router.get("/admin/audit")
def list_audit(limit: int = 200, action: str | None = None, p: Principal = Depends(require_admin),
               db: Session = Depends(get_db)):
    q = select(AuditLog).order_by(AuditLog.at.desc()).limit(min(limit, 1000))
    if action:
        q = q.where(AuditLog.action.like(f"{action}%"))
    return [{"id": a.id, "at": a.at.isoformat(), "actor_id": a.actor_id, "actor_type": a.actor_type,
             "action": a.action, "target_type": a.target_type, "target_id": a.target_id, "meta": a.meta}
            for a in db.scalars(q).all()]
