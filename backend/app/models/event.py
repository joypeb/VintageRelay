from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UtcDateTime


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (CheckConstraint("status IN ('active','closed')", name="status"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(16))
    entry_code: Mapped[str] = mapped_column(String(6), unique=True)
    organizer_participant_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("participants.id", use_alter=True)
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    closed_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
