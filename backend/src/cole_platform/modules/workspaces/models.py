from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from cole_platform.kernel.db import Base, TimestampMixin, utcnow


class Workspace(TimestampMixin, Base):
    __tablename__ = "workspace"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user_account.id", ondelete="CASCADE"), index=True)
    assignment_id: Mapped[str] = mapped_column(ForeignKey("assignment.id", ondelete="CASCADE"), index=True)
    assignment_version_id: Mapped[str] = mapped_column(ForeignKey("assignment_version.id"))
    runtime_profile: Mapped[str] = mapped_column(String(40), default="python-cpu")
    status: Mapped[str] = mapped_column(String(20), default="ready")  # ready | archived
    manifest: Mapped[dict] = mapped_column(JSON, default=dict)
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("user_id", "assignment_version_id"),)
