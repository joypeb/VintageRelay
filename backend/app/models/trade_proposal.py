from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UtcDateTime


class TradeProposal(Base):
    __tablename__ = "trade_proposals"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','confirmed','rejected','invalidated','cancelled')",
            name="status",
        ),
        Index(
            "uq_pending_cycle",
            "event_id",
            "cycle_key",
            unique=True,
            sqlite_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), ForeignKey("events.id"))
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))
    end_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cycle_key: Mapped[str] = mapped_column(String(1024))
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    confirmed_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
