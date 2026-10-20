from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from cole_platform.kernel.db import Base, TimestampMixin, utcnow


class Run(TimestampMixin, Base):
    """Execution of a submission against a simulator plugin version (docs/design/06 §5, 08 §2)."""
    __tablename__ = "run"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    submission_id: Mapped[str | None] = mapped_column(ForeignKey("submission.id", ondelete="CASCADE"), nullable=True, index=True)
    assignment_id: Mapped[str] = mapped_column(ForeignKey("assignment.id", ondelete="CASCADE"), index=True)
    assignment_version_id: Mapped[str] = mapped_column(ForeignKey("assignment_version.id"))
    plugin_version_id: Mapped[str] = mapped_column(ForeignKey("plugin_version.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("user_account.id"), index=True)

    mode: Mapped[str] = mapped_column(String(40), default="run")  # describe | validate-profile | validate-submission | run
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)  # queued | preparing | running | evaluating | succeeded | failed | error | timeout | cancelled
    attempt: Mapped[int] = mapped_column(Integer, default=1)

    passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)

    summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    validation_report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    runner_info: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    cancel_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TestResult(Base):
    """Individual test outcome within a run (docs/design/08 §2)."""
    __tablename__ = "test_result"
    __test__ = False

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("run.id", ondelete="CASCADE"), index=True)
    case_key: Mapped[str] = mapped_column(String(80), index=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20))  # pass | fail | error
    score: Mapped[float] = mapped_column(Float, default=0.0)
    latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    output: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
