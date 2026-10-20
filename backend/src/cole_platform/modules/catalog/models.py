from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from cole_platform.kernel.db import Base, TimestampMixin

TRACKS = ("AI_ENGINEER", "DATA_ENGINEER", "BUSINESS_ANALYST")


class Course(TimestampMixin, Base):
    __tablename__ = "course"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organization.id"))
    track: Mapped[str] = mapped_column(String(30), index=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | published
    # active: execution features available. planned: UI shell only (DE/BA in POC).
    execution_status: Mapped[str] = mapped_column(String(20), default="planned")
    source_import_id: Mapped[str | None] = mapped_column(String(40), nullable=True)


class Module(TimestampMixin, Base):
    __tablename__ = "course_module"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("course.id", ondelete="CASCADE"), index=True)
    order: Mapped[int] = mapped_column(Integer)
    code: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(300))
    group_path: Mapped[str | None] = mapped_column(String(300), nullable=True)  # "Học phần 1 - …"
    objectives: Mapped[str | None] = mapped_column(Text, nullable=True)


class Lesson(TimestampMixin, Base):
    __tablename__ = "lesson"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    module_id: Mapped[str] = mapped_column(ForeignKey("course_module.id", ondelete="CASCADE"), index=True)
    order: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(80))
    session_numbers: Mapped[list] = mapped_column(JSON, default=list)
    title: Mapped[str] = mapped_column(String(500))
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    objectives: Mapped[str | None] = mapped_column(Text, nullable=True)
    practice: Mapped[str | None] = mapped_column(Text, nullable=True)
    practice_candidate: Mapped[bool] = mapped_column(Boolean, default=False)
    kind: Mapped[str] = mapped_column(String(20), default="session")  # session | project
