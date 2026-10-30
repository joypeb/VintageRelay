from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UtcDateTime


class Photo(Base):
    __tablename__ = "photos"
    __table_args__ = (
        Index("ix_photos_event_id", "event_id"),
        UniqueConstraint("clothing_id", "position"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), ForeignKey("events.id"))
    uploader_id: Mapped[str] = mapped_column(String(36), ForeignKey("participants.id"))
    storage_location: Mapped[str] = mapped_column(String(64), unique=True)
    content_type: Mapped[str] = mapped_column(String(32))
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    clothing_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("clothes.id"), nullable=True
    )
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
