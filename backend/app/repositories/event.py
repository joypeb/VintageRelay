from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.domain.enums import EventStatus
from app.models.event import Event


def add(s: Session, event: Event) -> None:
    s.add(event)
    s.flush()


def get(s: Session, event_id: str) -> Event | None:
    return s.get(Event, event_id)


def entry_code_exists(s: Session, code: str) -> bool:
    return s.scalar(select(Event.entry_code).where(Event.entry_code == code)) is not None


def set_organizer(s: Session, event: Event, participant_id: str) -> None:
    event.organizer_participant_id = participant_id
    s.flush()


def mark_closed(s: Session, event_id: str, closed_at: datetime) -> int:
    result = s.connection().execute(
        update(Event)
        .where(Event.id == event_id, Event.status == EventStatus.ACTIVE)
        .values(status=EventStatus.CLOSED, closed_at=closed_at)
    )
    return result.rowcount
