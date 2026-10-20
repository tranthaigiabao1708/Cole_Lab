from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from cole_platform.kernel.db import Base, TimestampMixin


class Assignment(TimestampMixin, Base):
    __tablename__ = "assignment"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("course.id", ondelete="CASCADE"), index=True)
    lesson_id: Mapped[str | None] = mapped_column(ForeignKey("lesson.id", ondelete="SET NULL"), nullable=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    assignment_type: Mapped[str] = mapped_column(String(80))
    current_version_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="published")  # draft | published | archived


class TestSetVersion(TimestampMixin, Base):
    __tablename__ = "testset_version"
    __test__ = False  # not a pytest class
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    assignment_id: Mapped[str] = mapped_column(ForeignKey("assignment.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    count: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(200))  # tar.gz in answer_key bucket
    __table_args__ = (UniqueConstraint("assignment_id", "sha256"),)


class TestCase(Base):
    __tablename__ = "test_case"
    __test__ = False
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    testset_version_id: Mapped[str] = mapped_column(ForeignKey("testset_version.id", ondelete="CASCADE"), index=True)
    order: Mapped[int] = mapped_column(Integer)
    case_key: Mapped[str] = mapped_column(String(80))
    input: Mapped[dict] = mapped_column(JSON, default=dict)
    expected: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # {"input": "visible|after_run|hidden", "expected": "...", "notes": "..."}
    field_visibility: Mapped[dict] = mapped_column(JSON, default=dict)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    files: Mapped[list] = mapped_column(JSON, default=list)


class AssignmentVersion(TimestampMixin, Base):
    """Immutable once published (docs/design/08 §3)."""
    __tablename__ = "assignment_version"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    assignment_id: Mapped[str] = mapped_column(ForeignKey("assignment.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="published")
    content_sha: Mapped[str] = mapped_column(String(64))  # hash of the whole package => idempotent re-import
    readme: Mapped[str] = mapped_column(Text, default="")
    docs: Mapped[list] = mapped_column(JSON, default=list)  # [{name, key, size}]
    template_key: Mapped[str] = mapped_column(String(200))
    template_sha: Mapped[str] = mapped_column(String(64))
    run_command: Mapped[str] = mapped_column(String(300), default="")
    contract: Mapped[dict] = mapped_column(JSON, default=dict)
    default_manifest: Mapped[dict] = mapped_column(JSON, default=dict)
    plugin_id: Mapped[str] = mapped_column(String(80))
    plugin_version_range: Mapped[str] = mapped_column(String(40))
    profile: Mapped[dict] = mapped_column(JSON, default=dict)
    rubric: Mapped[list] = mapped_column(JSON, default=list)
    testset_version_id: Mapped[str | None] = mapped_column(ForeignKey("testset_version.id"), nullable=True)
    dataset_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dataset_info: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    limits: Mapped[dict] = mapped_column(JSON, default=dict)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (UniqueConstraint("assignment_id", "version"),)
