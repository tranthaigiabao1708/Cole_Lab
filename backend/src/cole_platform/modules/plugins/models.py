from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from cole_platform.kernel.db import Base, TimestampMixin


class SimulatorPlugin(TimestampMixin, Base):
    """A simulator family, e.g. `cole.cv-okng` (docs/design/06 §2, 08)."""
    __tablename__ = "simulator_plugin"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")


class PluginVersion(TimestampMixin, Base):
    """Immutable plugin release. status: registered | building | ready | failed | disabled."""
    __tablename__ = "plugin_version"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    plugin_id: Mapped[str] = mapped_column(ForeignKey("simulator_plugin.id", ondelete="CASCADE"), index=True)
    version: Mapped[str] = mapped_column(String(40))
    contract: Mapped[str] = mapped_column(String(40))
    image: Mapped[str] = mapped_column(String(200))
    renderer: Mapped[str] = mapped_column(String(80))
    manifest: Mapped[dict] = mapped_column(JSON, default=dict)
    source_dir: Mapped[str] = mapped_column(String(300))
    source_sha: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20), default="registered")
    image_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    build_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    built_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (UniqueConstraint("plugin_id", "version"),)
