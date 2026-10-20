from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from cole_platform.kernel.db import Base, TimestampMixin


class SyllabusImport(TimestampMixin, Base):
    __tablename__ = "syllabus_import"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organization.id"))
    created_by: Mapped[str] = mapped_column(ForeignKey("user_account.id"))
    filename: Mapped[str] = mapped_column(String(300))
    source_key: Mapped[str] = mapped_column(String(200))  # original file in storage (private)
    sha256: Mapped[str] = mapped_column(String(64))
    sheet: Mapped[str | None] = mapped_column(String(200), nullable=True)
    preset: Mapped[str | None] = mapped_column(String(40), nullable=True)
    profile: Mapped[dict] = mapped_column(JSON)
    parsed: Mapped[dict] = mapped_column(JSON)  # rows + tree + warnings (editable draft)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | published
    course_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
