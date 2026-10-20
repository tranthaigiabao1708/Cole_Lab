from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from cole_platform.kernel.db import Base, TimestampMixin, utcnow

ROLES = ("admin", "teacher", "student")


class Organization(TimestampMixin, Base):
    __tablename__ = "organization"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    settings: Mapped[dict] = mapped_column(JSON, default=dict)


class User(TimestampMixin, Base):
    __tablename__ = "user_account"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organization.id"))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20))  # org-scope role: admin | teacher | student
    password_hash: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default="active")


class UserSession(TimestampMixin, Base):
    __tablename__ = "user_session"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)  # sha256 of the cookie token
    user_id: Mapped[str] = mapped_column(ForeignKey("user_account.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CourseMembership(TimestampMixin, Base):
    __tablename__ = "course_membership"
    __table_args__ = (UniqueConstraint("user_id", "course_id"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user_account.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("course.id", ondelete="CASCADE"), index=True)
    role_in_course: Mapped[str] = mapped_column(String(20))  # teacher | student


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    actor_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    actor_type: Mapped[str] = mapped_column(String(20), default="user")
    action: Mapped[str] = mapped_column(String(80), index=True)
    target_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
