from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UtcDateTime


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), ForeignKey("events.id"))
    display_name: Mapped[str] = mapped_column(String(30))
    session_token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)

    __table_args__ = (
        Index(
            "uq_participants_event_id_display_name_lower",
            "event_id",
            func.lower(display_name),
            unique=True,
        ),
    )
