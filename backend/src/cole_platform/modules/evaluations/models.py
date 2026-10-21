from sqlalchemy import ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from cole_platform.kernel.db import Base, TimestampMixin


class Evaluation(TimestampMixin, Base):
    """Rubric and star evaluation of test cases in a run (docs/design/09 §A.7, 08 §2)."""
    __tablename__ = "evaluation"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("run.id", ondelete="CASCADE"), index=True)
    case_key: Mapped[str] = mapped_column(String(80), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user_account.id"), index=True)

    rating: Mapped[int] = mapped_column(Integer)  # 1 to 5 stars
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    criteria: Mapped[dict | None] = mapped_column(JSON, nullable=True)
