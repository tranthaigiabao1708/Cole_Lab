import hashlib
import secrets
from dataclasses import dataclass
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db, utcnow
from .errors import AppError, forbidden

COOKIE_NAME = "cole_session"
_ph = PasswordHasher()


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw_hash: str, pw: str) -> bool:
    try:
        return _ph.verify(pw_hash, pw)
    except VerifyMismatchError:
        return False


def _token_id(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass
class Principal:
    id: str
    org_id: str
    email: str
    name: str
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_teacher(self) -> bool:
        return self.role in ("teacher", "admin")


def create_session(db: Session, user_id: str) -> str:
    from cole_platform.modules.identity.models import UserSession

    token = secrets.token_urlsafe(32)
    db.add(UserSession(id=_token_id(token), user_id=user_id,
                       expires_at=utcnow() + timedelta(hours=settings.session_ttl_hours)))
    db.commit()
    return token


def destroy_session(db: Session, token: str | None) -> None:
    from cole_platform.modules.identity.models import UserSession

    if token:
        s = db.get(UserSession, _token_id(token))
        if s:
            db.delete(s)
            db.commit()


def principal_from_token(db: Session, token: str | None) -> Principal | None:
    from cole_platform.modules.identity.models import User, UserSession

    if not token:
        return None
    s = db.get(UserSession, _token_id(token))
    if not s:
        return None
    exp = s.expires_at if s.expires_at.tzinfo else s.expires_at.replace(tzinfo=utcnow().tzinfo)
    if exp < utcnow():
        return None
    u = db.scalar(select(User).where(User.id == s.user_id, User.status == "active"))
    if not u:
        return None
    return Principal(id=u.id, org_id=u.org_id, email=u.email, name=u.name, role=u.role)


def current_user(request: Request, db: Session = Depends(get_db)) -> Principal:
    p = principal_from_token(db, request.cookies.get(COOKIE_NAME))
    if not p:
        raise AppError(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")
    return p


def require_teacher(p: Principal = Depends(current_user)) -> Principal:
    if not p.is_teacher:
        raise forbidden()
    return p


def require_admin(p: Principal = Depends(current_user)) -> Principal:
    if not p.is_admin:
        raise forbidden()
    return p
