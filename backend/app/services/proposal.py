import logging
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.db import Db
from app.domain.enums import ClothingCategory, ClothingStatus, EventStatus
from app.domain.errors import (
    AppError,
    ClothingAlreadyConfirmedError,
    ClothingNotAvailableError,
    EventClosedError,
    IntentNotActiveError,
    InternalError,
    NotFoundError,
    ProposalVersionMismatchError,
)
from app.domain.matching import cycle_key
from app.domain.photos import photo_url
from app.models.clothing import Clothing as ClothingModel
from app.models.event import Event
from app.models.exchange_intent import ExchangeIntent
from app.models.participant import Participant
from app.models.photo import Photo as PhotoModel
from app.models.trade_participant import TradeParticipant
from app.models.trade_proposal import TradeProposal
from app.repositories import event as event_repo
from app.repositories import photo as photo_repo
from app.schemas.intent import ClothingSummary, IntentOwner
from app.schemas.proposal import Proposal, ProposalList, ProposalParticipant


def build_proposal(
    s: Session, settings: Settings, proposal: TradeProposal, caller: Participant
) -> Proposal:
    event = s.get(Event, proposal.event_id)
    if event is None:
        raise NotFoundError()
    parts = list(
        s.scalars(select(TradeParticipant).where(TradeParticipant.proposal_id == proposal.id))
    )
    mine = next((part for part in parts if part.participant_id == caller.id), None)
    if mine is None:
        raise NotFoundError()
    ordered = _order_from_caller(parts, mine)
    clothing_ids = list(
        {code for part in ordered for code in (part.offered_clothing_id, part.received_clothing_id)}
    )
    clothes: dict[str, ClothingModel] = (
        {
            row.id: row
            for row in s.scalars(select(ClothingModel).where(ClothingModel.id.in_(clothing_ids)))
        }
        if clothing_ids
        else {}
    )
    person_ids = {part.participant_id for part in ordered} | {
        clothing.owner_id for clothing in clothes.values()
    }
    people: dict[str, Participant] = (
        {
            row.id: row
            for row in s.scalars(select(Participant).where(Participant.id.in_(sorted(person_ids))))
        }
        if person_ids
        else {}
    )
    photo_map = photo_repo.photos_for(s, clothing_ids)
    items = [
        _build_participant(part, people, clothes, photo_map, event, settings, caller.id)
        for part in ordered
    ]
    event_active = event.status != EventStatus.CLOSED
    return Proposal(
        id=proposal.id,
        event_id=proposal.event_id,
        version=proposal.version,
        status=proposal.status,
        end_reason=proposal.end_reason,
        cycle_size=len(ordered),
        participants=items,
        my_response=mine.response,
        can_consent=proposal.status == "pending" and mine.response == "pending" and event_active,
        can_reject=proposal.status == "pending" and mine.response != "rejected" and event_active,
        can_cancel=proposal.status == "confirmed" and event_active,
        created_at=proposal.created_at,
        confirmed_at=proposal.confirmed_at,
        cancelled_at=proposal.cancelled_at,
        ended_at=proposal.ended_at,
    )


def list_proposals(
    db: Db,
    settings: Settings,
    event_id: str,
    participant: Participant,
    statuses: list[str] | None,
    clothing_id: str | None,
) -> ProposalList:
    with db.read() as s:
        event = event_repo.get(s, event_id)
        if event is None or participant.event_id != event.id:
            raise NotFoundError()
        stmt = (
            select(TradeProposal)
            .join(TradeParticipant, TradeParticipant.proposal_id == TradeProposal.id)
            .where(
                TradeProposal.event_id == event.id,
                TradeParticipant.participant_id == participant.id,
            )
        )
        if statuses:
            stmt = stmt.where(TradeProposal.status.in_(statuses))
        if clothing_id is not None:
            stmt = stmt.where(
                or_(
                    TradeParticipant.offered_clothing_id == clothing_id,
                    TradeParticipant.received_clothing_id == clothing_id,
                )
            )
        proposals = list(s.scalars(stmt.order_by(TradeProposal.created_at.desc())))
        items = [build_proposal(s, settings, proposal, participant) for proposal in proposals]
    return ProposalList(items=items)


def get_proposal(
    db: Db, settings: Settings, participant: Participant, proposal_id: str
) -> Proposal:
    with db.read() as s:
        proposal = s.get(TradeProposal, proposal_id)
        if proposal is None or proposal.event_id != participant.event_id:
            raise NotFoundError()
        mine = s.scalar(
            select(TradeParticipant).where(
                TradeParticipant.proposal_id == proposal.id,
                TradeParticipant.participant_id == participant.id,
            )
        )
        if mine is None:
            raise NotFoundError()
        return build_proposal(s, settings, proposal, participant)


def _order_from_caller(
    parts: list[TradeParticipant], mine: TradeParticipant
) -> list[TradeParticipant]:
    ordered = [mine]
    seen = {mine.participant_id}
    current = mine
    while len(ordered) < len(parts):
        nxt = next(
            (
                part
                for part in parts
                if part.participant_id not in seen
                and part.offered_clothing_id == current.received_clothing_id
            ),
            None,
        )
        if nxt is None:
            ordered.extend(
                sorted(
                    (part for part in parts if part.participant_id not in seen),
                    key=lambda part: part.participant_id,
                )
            )
            break
        ordered.append(nxt)
        seen.add(nxt.participant_id)
        current = nxt
    return ordered


def _build_participant(
    part: TradeParticipant,
    people: dict[str, Participant],
    clothes: dict[str, ClothingModel],
    photo_map: dict[str, list[PhotoModel]],
    event: Event,
    settings: Settings,
    caller_id: str,
) -> ProposalParticipant:
    person = people.get(part.participant_id)
    offered = clothes.get(part.offered_clothing_id)
    received = clothes.get(part.received_clothing_id)
    if person is None or offered is None or received is None:
        raise NotFoundError()
    return ProposalParticipant(
        participant=IntentOwner(
            participant_id=person.id,
            display_name=person.display_name,
            is_organizer=person.id == event.organizer_participant_id,
        ),
        is_me=person.id == caller_id,
        offered_clothing=_build_summary(offered, people, photo_map, event, settings),
        received_clothing=_build_summary(received, people, photo_map, event, settings),
        response=part.response,
        responded_at=part.responded_at,
    )


def _build_summary(
    clothing: ClothingModel,
    people: dict[str, Participant],
    photo_map: dict[str, list[PhotoModel]],
    event: Event,
    settings: Settings,
) -> ClothingSummary:
    owner = people.get(clothing.owner_id)
    if owner is None:
        raise NotFoundError()
    photos = photo_map.get(clothing.id, [])
    first = photos[0] if photos else None
    return ClothingSummary(
        id=clothing.id,
        owner=IntentOwner(
            participant_id=owner.id,
            display_name=owner.display_name,
            is_organizer=owner.id == event.organizer_participant_id,
        ),
        photo_url=photo_url(settings.app_base_url, first.id) if first else "",
        category=ClothingCategory(clothing.category),
        title=clothing.title,
        description=clothing.description,
        status=ClothingStatus(clothing.status),
        content_version=clothing.content_version,
    )


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


logger = logging.getLogger(__name__)


def _latest_pending_id(s: Session, proposal: TradeProposal) -> str | None:
    row = s.scalar(
        select(TradeProposal)
        .where(
            TradeProposal.event_id == proposal.event_id,
            TradeProposal.cycle_key == proposal.cycle_key,
            TradeProposal.status == "pending",
        )
        .order_by(TradeProposal.version.desc())
    )
    return row.id if row is not None else None


def _version_mismatch(s: Session, proposal: TradeProposal) -> ProposalVersionMismatchError:
    return ProposalVersionMismatchError(
        details={
            "currentStatus": proposal.status,
            "latestProposalId": _latest_pending_id(s, proposal),
        }
    )


def _end_reason_for(exc: AppError) -> str:
    if isinstance(exc, IntentNotActiveError):
        return "intent_changed"
    if isinstance(exc, ClothingAlreadyConfirmedError):
        return "clothing_confirmed_elsewhere"
    if isinstance(exc, ClothingNotAvailableError):
        return "clothing_withdrawn"
    raise exc


def consent(
    db: Db, settings: Settings, participant: Participant, proposal_id: str, version: int
) -> Proposal:
    pending_error: AppError | None = None
    response: Proposal | None = None
    confirmed = False
    proposal_id_for_log = proposal_id
    event_id_for_log = participant.event_id
    with db.write() as s:
        proposal = s.get(TradeProposal, proposal_id)
        if proposal is None or proposal.event_id != participant.event_id:
            raise NotFoundError()
        mine = s.scalar(
            select(TradeParticipant).where(
                TradeParticipant.proposal_id == proposal.id,
                TradeParticipant.participant_id == participant.id,
            )
        )
        if mine is None:
            raise NotFoundError()
        if (
            mine.response == "consented"
            and proposal.version == version
            and proposal.status in ("pending", "confirmed")
        ):
            return build_proposal(s, settings, proposal, participant)
        event = s.get(Event, proposal.event_id)
        if event is None:
            raise NotFoundError()
        if event.status == EventStatus.CLOSED:
            raise EventClosedError()
        if proposal.status != "pending" or proposal.version != version:
            raise _version_mismatch(s, proposal)
        now = datetime.now(UTC)
        try:
            with s.begin_nested():
                mine.response = "consented"
                mine.responded_at = now
                s.flush()
                try_confirm_if_unanimous(s, proposal, now)
        except AppError as exc:
            if not isinstance(
                exc,
                IntentNotActiveError | ClothingAlreadyConfirmedError | ClothingNotAvailableError,
            ):
                raise
            end_reason = _end_reason_for(exc)
            rowcount = _invalidate_pending(s, proposal, end_reason, now)
            s.flush()
            if rowcount == 1:
                pending_error = exc
            else:
                refreshed_event = s.get(Event, proposal.event_id)
                if refreshed_event is not None and refreshed_event.status == EventStatus.CLOSED:
                    pending_error = EventClosedError()
                else:
                    s.refresh(proposal)
                    pending_error = _version_mismatch(s, proposal)
            response = None
            confirmed = False
        else:
            response = build_proposal(s, settings, proposal, participant)
            confirmed = proposal.status == "confirmed"
        proposal_id_for_log = proposal.id
        event_id_for_log = proposal.event_id
    if pending_error is not None:
        raise pending_error
    if response is None:
        raise InternalError()
    logger.info(
        "proposal_confirmed" if confirmed else "proposal_consented",
        extra={"proposal_id": proposal_id_for_log, "event_id": event_id_for_log},
    )
    return response


def reject(
    db: Db, settings: Settings, participant: Participant, proposal_id: str, version: int
) -> Proposal:
    with db.write() as s:
        proposal = s.get(TradeProposal, proposal_id)
        if proposal is None or proposal.event_id != participant.event_id:
            raise NotFoundError()
        mine = s.scalar(
            select(TradeParticipant).where(
                TradeParticipant.proposal_id == proposal.id,
                TradeParticipant.participant_id == participant.id,
            )
        )
        if mine is None:
            raise NotFoundError()
        if proposal.status == "rejected":
            return build_proposal(s, settings, proposal, participant)
        event = s.get(Event, proposal.event_id)
        if event is None:
            raise NotFoundError()
        if event.status == EventStatus.CLOSED:
            raise EventClosedError()
        if proposal.status != "pending" or proposal.version != version:
            raise _version_mismatch(s, proposal)
        now = datetime.now(UTC)
        mine.response = "rejected"
        mine.responded_at = now
        proposal.status = "rejected"
        proposal.end_reason = "participant_rejected"
        proposal.ended_at = now
        s.flush()
        response = build_proposal(s, settings, proposal, participant)
        logged_proposal_id = proposal.id
        logged_event_id = proposal.event_id
    logger.info(
        "proposal_rejected",
        extra={"proposal_id": logged_proposal_id, "event_id": logged_event_id},
    )
    return response


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
