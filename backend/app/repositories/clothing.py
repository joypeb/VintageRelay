from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.clothing import Clothing


def add(s: Session, clothing: Clothing) -> None:
    s.add(clothing)
    s.flush()


def get_in_event(s: Session, clothing_id: str, event_id: str) -> Clothing | None:
    return s.scalar(
        select(Clothing).where(Clothing.id == clothing_id, Clothing.event_id == event_id)
    )


def photo_is_attached(s: Session, photo_id: str) -> bool:
    return s.scalar(select(Clothing.id).where(Clothing.photo_id == photo_id)) is not None


def count_available(s: Session, event_id: str) -> int:
    stmt = (
        select(func.count())
        .select_from(Clothing)
        .where(Clothing.event_id == event_id, Clothing.status == "available")
    )
    return s.execute(stmt).scalar_one()
