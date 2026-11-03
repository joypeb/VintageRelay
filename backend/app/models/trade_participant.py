from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UtcDateTime


class TradeParticipant(Base):
    __tablename__ = "trade_participants"
    __table_args__ = (
        CheckConstraint("response IN ('pending','consented','rejected')", name="response"),
        CheckConstraint("offered_clothing_id != received_clothing_id", name="no_self_trade"),
        UniqueConstraint("proposal_id", "participant_id"),
        Index(
            "uq_confirmed_offered_clothing",
            "offered_clothing_id",
            unique=True,
            sqlite_where=text("is_confirmed = 1"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    proposal_id: Mapped[str] = mapped_column(String(36), ForeignKey("trade_proposals.id"))
    participant_id: Mapped[str] = mapped_column(String(36), ForeignKey("participants.id"))
    offered_clothing_id: Mapped[str] = mapped_column(String(36), ForeignKey("clothes.id"))
    offered_content_version: Mapped[int] = mapped_column(Integer)
    received_clothing_id: Mapped[str] = mapped_column(String(36), ForeignKey("clothes.id"))
    response: Mapped[str] = mapped_column(String(16))
    responded_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("0"))
