from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UtcDateTime


class ExchangeIntent(Base):
    __tablename__ = "exchange_intents"
    __table_args__ = (
        CheckConstraint("status IN ('active','withdrawn','declined','invalidated')", name="status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), ForeignKey("events.id"))
    participant_id: Mapped[str] = mapped_column(String(36), ForeignKey("participants.id"))
    offered_clothing_id: Mapped[str] = mapped_column(String(36), ForeignKey("clothes.id"))
    wanted_clothing_id: Mapped[str] = mapped_column(String(36), ForeignKey("clothes.id"))
    status: Mapped[str] = mapped_column(String(16))
    accepted_proposal_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("trade_proposals.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime)
