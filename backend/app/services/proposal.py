from datetime import datetime
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.errors import (
    AppError,
    ClothingAlreadyConfirmedError,
    ClothingNotAvailableError,
    IntentNotActiveError,
)
from app.domain.matching import cycle_key
from app.models.clothing import Clothing as ClothingModel
from app.models.exchange_intent import ExchangeIntent
from app.models.trade_participant import TradeParticipant
from app.models.trade_proposal import TradeProposal
from app.schemas.proposal import Proposal


def to_schema(proposal: TradeProposal) -> Proposal:
    return Proposal(id=proposal.id, status=proposal.status, version=proposal.version)


def ensure_two_person_proposal(
    s: Session,
    event_id: str,
    sender_id: str,
    accepter_id: str,
    offered_id: str,
    wanted_id: str,
    clothes: dict[str, ClothingModel],
    now: datetime,
) -> TradeProposal:
    legs = [(sender_id, offered_id, wanted_id), (accepter_id, wanted_id, offered_id)]
    key = cycle_key(legs)
    pending = s.scalar(
        select(TradeProposal).where(
            TradeProposal.event_id == event_id,
            TradeProposal.cycle_key == key,
            TradeProposal.status == "pending",
        )
    )
    if pending is not None:
        _record_accepter_consent(s, pending, accepter_id, now)
        return pending
    latest = s.scalar(
        select(TradeProposal)
        .where(TradeProposal.event_id == event_id, TradeProposal.cycle_key == key)
        .order_by(TradeProposal.version.desc())
    )
    version = latest.version + 1 if latest is not None else 1
    proposal = TradeProposal(
        id=str(uuid4()),
        event_id=event_id,
        version=version,
        status="pending",
        end_reason=None,
        cycle_key=key,
        created_at=now,
        confirmed_at=None,
        cancelled_at=None,
        ended_at=None,
    )
    s.add(proposal)
    s.flush()
    for participant_id, give, receive in legs:
        offered = clothes.get(give)
        if offered is None:
            continue
        is_accepter = participant_id == accepter_id
        s.add(
            TradeParticipant(
                id=str(uuid4()),
                proposal_id=proposal.id,
                participant_id=participant_id,
                offered_clothing_id=give,
                offered_content_version=offered.content_version,
                received_clothing_id=receive,
                response="consented" if is_accepter else "pending",
                responded_at=now if is_accepter else None,
                is_confirmed=False,
            )
        )
    s.flush()
    return proposal


def _record_accepter_consent(
    s: Session, proposal: TradeProposal, accepter_id: str, now: datetime
) -> None:
    row = s.scalar(
        select(TradeParticipant).where(
            TradeParticipant.proposal_id == proposal.id,
            TradeParticipant.participant_id == accepter_id,
        )
    )
    if row is None:
        return
    if row.response != "consented":
        row.response = "consented"
        row.responded_at = now
        s.flush()


class _RecheckError(Exception):
    def __init__(self, error: AppError, end_reason: str) -> None:
        super().__init__(str(error))
        self.error = error
        self.end_reason = end_reason


def try_confirm_if_unanimous(s: Session, proposal: TradeProposal, now: datetime) -> bool:
    """Confirm a pending proposal once every participant consented.

    Shared by accept (T-B2FIX) and the later consent endpoint (T020):
    recheck active intents/ownership/availability, conditional
    available->confirmed, set is_confirmed + confirmed/confirmedAt,
    invalidate other pending proposals sharing garments. On recheck
    failure the proposal is invalidated with the matching endReason
    and the 409 error is raised.
    """

    parts = list(
        s.scalars(select(TradeParticipant).where(TradeParticipant.proposal_id == proposal.id))
    )
    if not parts or not all(p.response == "consented" for p in parts):
        return False
    try:
        with s.begin_nested():
            _confirm_unanimous(s, proposal, parts, now)
    except _RecheckError as failure:
        _invalidate_pending(s, proposal, failure.end_reason, now)
        raise failure.error from failure
    except IntegrityError as err:
        guilty = _find_confirmed_conflict(s, parts)
        _invalidate_pending(s, proposal, "clothing_confirmed_elsewhere", now)
        raise ClothingAlreadyConfirmedError(details={"clothingId": guilty}) from err
    return True


def _confirm_unanimous(
    s: Session, proposal: TradeProposal, parts: list[TradeParticipant], now: datetime
) -> None:
    ordered = sorted(parts, key=lambda p: p.participant_id)
    clothes: dict[str, ClothingModel] = {}
    for part in ordered:
        clothing = s.get(ClothingModel, part.offered_clothing_id)
        if (
            clothing is None
            or clothing.event_id != proposal.event_id
            or clothing.owner_id != part.participant_id
        ):
            raise _RecheckError(
                IntentNotActiveError(details={"intentId": _intent_id_for_leg(s, proposal, part)}),
                "intent_changed",
            )
        active = s.scalar(
            select(ExchangeIntent).where(
                ExchangeIntent.event_id == proposal.event_id,
                ExchangeIntent.participant_id == part.participant_id,
                ExchangeIntent.offered_clothing_id == part.offered_clothing_id,
                ExchangeIntent.wanted_clothing_id == part.received_clothing_id,
                ExchangeIntent.status == "active",
            )
        )
        if active is None:
            raise _RecheckError(
                IntentNotActiveError(details={"intentId": _intent_id_for_leg(s, proposal, part)}),
                "intent_changed",
            )
        if clothing.status == "confirmed":
            raise _RecheckError(
                ClothingAlreadyConfirmedError(details={"clothingId": clothing.id}),
                "clothing_confirmed_elsewhere",
            )
        if clothing.status != "available":
            raise _RecheckError(
                ClothingNotAvailableError(details={"clothingId": clothing.id}),
                "clothing_withdrawn",
            )
        clothes[clothing.id] = clothing
    for clothing_id in sorted(clothes):
        result = s.connection().execute(
            update(ClothingModel)
            .where(ClothingModel.id == clothing_id, ClothingModel.status == "available")
            .values(status="confirmed")
        )
        if result.rowcount != 1:
            current = s.get(ClothingModel, clothing_id)
            if current is not None and current.status == "confirmed":
                raise _RecheckError(
                    ClothingAlreadyConfirmedError(details={"clothingId": clothing_id}),
                    "clothing_confirmed_elsewhere",
                )
            raise _RecheckError(
                ClothingNotAvailableError(details={"clothingId": clothing_id}),
                "clothing_withdrawn",
            )
        clothes[clothing_id].status = "confirmed"
    for part in parts:
        part.is_confirmed = True
    proposal.status = "confirmed"
    proposal.end_reason = None
    proposal.confirmed_at = now
    s.flush()
    _invalidate_sharing_proposals(s, proposal, sorted(clothes), now)


def _intent_id_for_leg(s: Session, proposal: TradeProposal, part: TradeParticipant) -> str:
    row = s.scalar(
        select(ExchangeIntent).where(
            ExchangeIntent.event_id == proposal.event_id,
            ExchangeIntent.participant_id == part.participant_id,
            ExchangeIntent.offered_clothing_id == part.offered_clothing_id,
            ExchangeIntent.wanted_clothing_id == part.received_clothing_id,
        )
    )
    return row.id if row is not None else ""


def _find_confirmed_conflict(s: Session, parts: list[TradeParticipant]) -> str:
    offered_ids = sorted({p.offered_clothing_id for p in parts})
    if offered_ids:
        hit = s.scalar(
            select(TradeParticipant.offered_clothing_id).where(
                TradeParticipant.offered_clothing_id.in_(offered_ids),
                TradeParticipant.is_confirmed.is_(True),
            )
        )
        if hit is not None:
            return str(hit)
        for clothing_id in offered_ids:
            clothing = s.get(ClothingModel, clothing_id)
            if clothing is not None and clothing.status == "confirmed":
                return clothing_id
        return offered_ids[0]
    return ""


def _invalidate_pending(s: Session, proposal: TradeProposal, end_reason: str, now: datetime) -> int:
    result = s.connection().execute(
        update(TradeProposal)
        .where(TradeProposal.id == proposal.id, TradeProposal.status == "pending")
        .values(status="invalidated", end_reason=end_reason, ended_at=now)
    )
    if result.rowcount == 1:
        proposal.status = "invalidated"
        proposal.end_reason = end_reason
        proposal.ended_at = now
        s.flush()
    return result.rowcount


def _invalidate_sharing_proposals(
    s: Session, proposal: TradeProposal, clothing_ids: list[str], now: datetime
) -> None:
    if not clothing_ids:
        return
    stmt = (
        select(TradeProposal)
        .join(TradeParticipant, TradeParticipant.proposal_id == TradeProposal.id)
        .where(
            TradeProposal.event_id == proposal.event_id,
            TradeProposal.status == "pending",
            TradeProposal.id != proposal.id,
            (
                TradeParticipant.offered_clothing_id.in_(clothing_ids)
                | TradeParticipant.received_clothing_id.in_(clothing_ids)
            ),
        )
    )
    seen: set[str] = set()
    for other in s.scalars(stmt):
        if other.id in seen:
            continue
        seen.add(other.id)
        other.status = "invalidated"
        other.end_reason = "clothing_confirmed_elsewhere"
        other.ended_at = now
    if seen:
        s.flush()
