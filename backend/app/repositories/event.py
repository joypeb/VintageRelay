from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.event import Event


def add(s: Session, event: Event) -> None:
    s.add(event)
    s.flush()


def entry_code_exists(s: Session, code: str) -> bool:
    return s.scalar(select(Event.entry_code).where(Event.entry_code == code)) is not None


def set_organizer(s: Session, event: Event, participant_id: str) -> None:
    event.organizer_participant_id = participant_id
    s.flush()
