from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models.clothing_analysis import ClothingAnalysis


def replace_pending(
    s: Session, clothing_id: str, content_version: int, now: datetime
) -> ClothingAnalysis:
    """Replace the current row with a pending row for the new version."""
    s.execute(delete(ClothingAnalysis).where(ClothingAnalysis.clothing_id == clothing_id))
    row = ClothingAnalysis(
        id=str(uuid4()),
        clothing_id=clothing_id,
        content_version=content_version,
        status="pending",
        features=None,
        uncertainties=[],
        model_info=None,
        updated_at=now,
    )
    s.add(row)
    s.flush()
    return row


def get_current(s: Session, clothing_id: str) -> ClothingAnalysis | None:
    """Return the single current row for a garment, if any."""
    return s.scalar(select(ClothingAnalysis).where(ClothingAnalysis.clothing_id == clothing_id))


def conditional_save(
    s: Session,
    clothing_id: str,
    content_version: int,
    features: dict[str, Any] | None,
    uncertainties: list[Any],
    model_info: dict[str, Any] | None,
    now: datetime,
) -> int:
    """Save done only if the row still holds this version and is not done.

    Single conditional write; the first done wins. Returns affected rowcount
    (0 means discarded: version changed, withdrawn, or already done).
    """
    stmt = (
        update(ClothingAnalysis)
        .where(
            ClothingAnalysis.clothing_id == clothing_id,
            ClothingAnalysis.content_version == content_version,
            ClothingAnalysis.status != "done",
        )
        .values(
            status="done",
            features=features,
            uncertainties=uncertainties,
            model_info=model_info,
            updated_at=now,
        )
    )
    return s.connection().execute(stmt).rowcount


def mark_failed(s: Session, clothing_id: str, content_version: int, now: datetime) -> int:
    """Mark pending failed only if the row still holds this version."""
    stmt = (
        update(ClothingAnalysis)
        .where(
            ClothingAnalysis.clothing_id == clothing_id,
            ClothingAnalysis.content_version == content_version,
            ClothingAnalysis.status == "pending",
        )
        .values(status="failed", updated_at=now)
    )
    return s.connection().execute(stmt).rowcount


def mark_failed_all(s: Session, now: datetime) -> int:
    """Mark every leftover pending row failed (startup cleanup)."""
    stmt = (
        update(ClothingAnalysis)
        .where(ClothingAnalysis.status == "pending")
        .values(status="failed", updated_at=now)
    )
    return s.connection().execute(stmt).rowcount
