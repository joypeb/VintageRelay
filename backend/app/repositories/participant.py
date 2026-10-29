from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.participant import Participant


def add(s: Session, participant: Participant) -> None:
    s.add(participant)
    s.flush()


def get_by_token_hash(s: Session, token_hash: str) -> Participant | None:
    return s.scalar(select(Participant).where(Participant.session_token_hash == token_hash))


def count_by_event(s: Session, event_id: str) -> int:
    stmt = select(func.count()).select_from(Participant).where(Participant.event_id == event_id)
    return s.execute(stmt).scalar_one()


def list_display_names(s: Session, event_id: str) -> list[str]:
    stmt = select(Participant.display_name).where(Participant.event_id == event_id)
    return list(s.scalars(stmt))
