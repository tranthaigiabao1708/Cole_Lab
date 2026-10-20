from datetime import datetime

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from cole_platform.kernel.db import Base, utcnow


class Submission(Base):
    """Immutable snapshot of a workspace + confirmed manifest (docs/design/08 §2)."""
    __tablename__ = "submission"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspace.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user_account.id"), index=True)
    assignment_id: Mapped[str] = mapped_column(ForeignKey("assignment.id"), index=True)
    assignment_version_id: Mapped[str] = mapped_column(ForeignKey("assignment_version.id"))
    seq: Mapped[int] = mapped_column(Integer)
    snapshot_key: Mapped[str] = mapped_column(String(200))
    sha256: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(BigInteger)
    file_count: Mapped[int] = mapped_column(Integer)
    manifest: Mapped[dict] = mapped_column(JSON)
    validation_status: Mapped[str] = mapped_column(String(20))  # valid | invalid
    validation_report: Mapped[dict] = mapped_column(JSON)
    plugin_validation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("workspace_id", "seq"),)


class Artifact(Base):
    __tablename__ = "artifact"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submission.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(40))
    path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    format: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
