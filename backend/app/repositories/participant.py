from sqlalchemy.orm import Session

from app.models.participant import Participant


def add(s: Session, participant: Participant) -> None:
    s.add(participant)
    s.flush()
