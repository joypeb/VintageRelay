from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UtcDateTime


class Photo(Base):
    __tablename__ = "photos"
    __table_args__ = (Index("ix_photos_event_id", "event_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), ForeignKey("events.id"))
    uploader_id: Mapped[str] = mapped_column(String(36), ForeignKey("participants.id"))
    storage_location: Mapped[str] = mapped_column(String(64), unique=True)
    content_type: Mapped[str] = mapped_column(String(32))
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
