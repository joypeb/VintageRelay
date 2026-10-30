from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.domain.enums import ClothingStatus, Ownership
from app.models.clothing import Clothing
from app.models.event import Event
from app.models.participant import Participant


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


def list_visible(
    s: Session,
    event_id: str,
    viewer_id: str,
    ownership: Ownership,
    statuses: list[ClothingStatus] | None,
) -> list[tuple[Clothing, str, str | None]]:
    stmt = (
        select(Clothing, Participant.display_name, Event.organizer_participant_id)
        .join(Participant, Participant.id == Clothing.owner_id)
        .join(Event, Event.id == Clothing.event_id)
        .where(Clothing.event_id == event_id)
    )
    if ownership == Ownership.MINE:
        stmt = stmt.where(Clothing.owner_id == viewer_id)
    elif ownership == Ownership.OTHERS:
        stmt = stmt.where(Clothing.owner_id != viewer_id)
    stmt = stmt.where(
        or_(Clothing.owner_id == viewer_id, Clothing.status != ClothingStatus.WITHDRAWN)
    )
    if statuses:
        stmt = stmt.where(Clothing.status.in_(statuses))
    stmt = stmt.order_by(Clothing.created_at.desc(), Clothing.id.desc())
    return [(row[0], row[1], row[2]) for row in s.execute(stmt)]
