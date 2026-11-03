from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.clothing import Clothing
from app.models.exchange_intent import ExchangeIntent


def add(s: Session, intent: ExchangeIntent) -> None:
    s.add(intent)
    s.flush()


def get(s: Session, intent_id: str) -> ExchangeIntent | None:
    return s.get(ExchangeIntent, intent_id)


def find_active_pair(
    s: Session,
    event_id: str,
    participant_id: str,
    offered_id: str,
    wanted_id: str,
) -> ExchangeIntent | None:
    return s.scalar(
        select(ExchangeIntent).where(
            ExchangeIntent.event_id == event_id,
            ExchangeIntent.participant_id == participant_id,
            ExchangeIntent.offered_clothing_id == offered_id,
            ExchangeIntent.wanted_clothing_id == wanted_id,
            ExchangeIntent.status == "active",
        )
    )


def list_sent(
    s: Session,
    event_id: str,
    participant_id: str,
    statuses: list[str],
    wanted_id: str | None,
) -> list[ExchangeIntent]:
    stmt = select(ExchangeIntent).where(
        ExchangeIntent.event_id == event_id,
        ExchangeIntent.participant_id == participant_id,
        ExchangeIntent.status.in_(statuses),
    )
    if wanted_id is not None:
        stmt = stmt.where(ExchangeIntent.wanted_clothing_id == wanted_id)
    stmt = stmt.order_by(ExchangeIntent.created_at.desc(), ExchangeIntent.id.desc())
    return list(s.scalars(stmt))


def list_received(
    s: Session,
    event_id: str,
    receiver_id: str,
    statuses: list[str],
    wanted_id: str | None,
) -> list[ExchangeIntent]:
    stmt = (
        select(ExchangeIntent)
        .join(Clothing, Clothing.id == ExchangeIntent.wanted_clothing_id)
        .where(
            ExchangeIntent.event_id == event_id,
            Clothing.owner_id == receiver_id,
            ExchangeIntent.status.in_(statuses),
        )
    )
    if wanted_id is not None:
        stmt = stmt.where(ExchangeIntent.wanted_clothing_id == wanted_id)
    stmt = stmt.order_by(ExchangeIntent.created_at.desc(), ExchangeIntent.id.desc())
    return list(s.scalars(stmt))
