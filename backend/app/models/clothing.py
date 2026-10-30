from datetime import datetime

from sqlalchemy import CheckConstraint, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UtcDateTime


class Clothing(Base):
    __tablename__ = "clothes"
    __table_args__ = (
        CheckConstraint("status IN ('available','confirmed','withdrawn')", name="status"),
        CheckConstraint("category IN ('top','outer','bottom','other')", name="category"),
        Index("ix_clothes_event_id_created_at", "event_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), ForeignKey("events.id"))
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("participants.id"))
    title: Mapped[str] = mapped_column(String(100))
    category: Mapped[str] = mapped_column(String(16))
    description: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(16))
    content_version: Mapped[int] = mapped_column(Integer)
    measure_total_length: Mapped[float | None] = mapped_column(Float)
    measure_chest: Mapped[float | None] = mapped_column(Float)
    measure_shoulder: Mapped[float | None] = mapped_column(Float)
    measure_sleeve: Mapped[float | None] = mapped_column(Float)
    measure_waist: Mapped[float | None] = mapped_column(Float)
    measure_hem: Mapped[float | None] = mapped_column(Float)
    measure_inseam: Mapped[float | None] = mapped_column(Float)
    measure_thigh: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime)
