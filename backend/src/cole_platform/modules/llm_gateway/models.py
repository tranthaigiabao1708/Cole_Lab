from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, JSON
from sqlalchemy.orm import Mapped, mapped_column

from cole_platform.kernel.db import Base, TimestampMixin, utcnow


class VirtualKey(TimestampMixin, Base):
    """Virtual API key per workspace/run with hard budget limits (docs/design/09 §A.5, doc 11)."""
    __tablename__ = "virtual_key"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    key_hash: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    key_prefix: Mapped[str] = mapped_column(String(20), index=True)

    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspace.id", ondelete="CASCADE"), nullable=True, index=True)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("run.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user_account.id"), index=True)

    budget_usd: Mapped[float] = mapped_column(Float, default=0.50)
    spent_usd: Mapped[float] = mapped_column(Float, default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class LLMUsageLog(Base):
    """Immutable audit of LLM requests through the platform gateway."""
    __tablename__ = "llm_usage_log"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    virtual_key_id: Mapped[str] = mapped_column(ForeignKey("virtual_key.id", ondelete="CASCADE"), index=True)
    model: Mapped[str] = mapped_column(String(80))
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
