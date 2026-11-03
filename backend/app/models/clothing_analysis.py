from datetime import datetime
from typing import Any

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UtcDateTime


class ClothingAnalysis(Base):
    """Single current analysis row per garment (018).

    Register/edit replaces the row with a new ``pending`` version; the job
    stores ``done`` via a conditional write. ``stale`` is reserved and never
    emitted in this slice.
    """

    __tablename__ = "clothing_analyses"
    __table_args__ = (
        CheckConstraint("status IN ('pending','done','failed','stale')", name="status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    clothing_id: Mapped[str] = mapped_column(String(36), ForeignKey("clothes.id"), unique=True)
    content_version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))
    features: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    uncertainties: Mapped[list[Any]] = mapped_column(JSON, nullable=False)
    model_info: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime)
