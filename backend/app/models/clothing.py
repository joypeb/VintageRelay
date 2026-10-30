from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UtcDateTime


class Clothing(Base):
    __tablename__ = "clothes"
    __table_args__ = (
        CheckConstraint("status IN ('available','confirmed','withdrawn')", name="status"),
        Index("ix_clothes_event_id_created_at", "event_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), ForeignKey("events.id"))
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("participants.id"))
    photo_id: Mapped[str] = mapped_column(String(36), ForeignKey("photos.id"), unique=True)
    description: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(16))
    content_version: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime)
