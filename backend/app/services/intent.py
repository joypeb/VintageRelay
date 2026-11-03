import logging
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.db import Db
from app.domain.enums import ClothingCategory, ClothingStatus, EventStatus
from app.domain.errors import (
    AppError,
    ClothingAlreadyConfirmedError,
    ClothingNotAvailableError,
    EventClosedError,
    ForbiddenError,
    NotFoundError,
)
from app.domain.matching import cycle_key, detect_cycles, is_suppressed
from app.domain.photos import photo_url
from app.models.clothing import Clothing as ClothingModel
from app.models.event import Event
from app.models.exchange_intent import ExchangeIntent
from app.models.participant import Participant
from app.models.photo import Photo as PhotoModel
from app.models.trade_participant import TradeParticipant
from app.models.trade_proposal import TradeProposal
from app.repositories import event as event_repo
from app.repositories import intent as intent_repo
from app.repositories import photo as photo_repo
from app.schemas.intent import (
    ClothingSummary,
    Intent,
    IntentCreate,
    IntentList,
    IntentOwner,
)

logger = logging.getLogger(__name__)


class OwnClothingError(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"
    message = "You cannot request your own garment."

    def __init__(self) -> None:
        super().__init__(
            self.message,
            details={"fields": [{"field": "wantedClothingId", "reason": "own_clothing"}]},
        )


_INACTIVE_REPLAY = frozenset({"withdrawn", "declined", "invalidated"})


class IntentService:
    def __init__(
        self,
        db: Db,
        settings: Settings,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
        intent_id_generator: Callable[[], str] = lambda: str(uuid4()),
    ) -> None:
        self.db = db
        self.settings = settings
        self.clock = clock
        self.intent_id_generator = intent_id_generator

    def register(
        self, event_id: str, participant: Participant, body: IntentCreate
    ) -> tuple[Intent, bool]:
        with self.db.write() as s:
            event = event_repo.get(s, event_id)
            if event is None or participant.event_id != event.id:
                raise NotFoundError()
            offered = s.get(ClothingModel, body.offered_clothing_id)
            wanted = s.get(ClothingModel, body.wanted_clothing_id)
            if (
                offered is None
                or wanted is None
                or offered.event_id != event.id
                or wanted.event_id != event.id
            ):
                raise NotFoundError()
            if offered.owner_id != participant.id:
                raise ForbiddenError()
            if wanted.owner_id == participant.id:
                raise OwnClothingError()
            existing = intent_repo.find_active_pair(
                s, event.id, participant.id, offered.id, wanted.id
            )
            if existing is not None:
                return self._build_intent(s, existing, event), False
            if event.status == EventStatus.CLOSED:
                raise EventClosedError()
            if (
                offered.status == ClothingStatus.CONFIRMED
                or wanted.status == ClothingStatus.CONFIRMED
            ):
                guilty = offered.id if offered.status == ClothingStatus.CONFIRMED else wanted.id
                raise ClothingAlreadyConfirmedError(details={"clothingId": guilty})
            if (
                offered.status != ClothingStatus.AVAILABLE
                or wanted.status != ClothingStatus.AVAILABLE
            ):
                guilty = offered.id if offered.status != ClothingStatus.AVAILABLE else wanted.id
                raise ClothingNotAvailableError(details={"clothingId": guilty})
            now = self.clock()
            intent = ExchangeIntent(
                id=self.intent_id_generator(),
                event_id=event.id,
                participant_id=participant.id,
                offered_clothing_id=offered.id,
                wanted_clothing_id=wanted.id,
                status="active",
                accepted_proposal_id=None,
                created_at=now,
                updated_at=now,
            )
            intent_repo.add(s, intent)
            self._recalculate_cycles(s, event, intent, now)
            response = self._build_intent(s, intent, event)
        logger.info(
            "intent_registered",
            extra={
                "intent_id": intent.id,
                "event_id": event.id,
            },
        )
        return response, True

    def list_intents(
        self,
        event_id: str,
        participant: Participant,
        direction: str,
        statuses: list[str],
        wanted_id: str | None,
    ) -> IntentList:
        with self.db.read() as s:
            event = event_repo.get(s, event_id)
            if event is None or participant.event_id != event.id:
                raise NotFoundError()
            if direction == "received":
                rows = intent_repo.list_received(s, event.id, participant.id, statuses, wanted_id)
            else:
                rows = intent_repo.list_sent(s, event.id, participant.id, statuses, wanted_id)
            items = [self._build_intent(s, row, event) for row in rows]
        return IntentList(items=items)

    def withdraw(self, participant: Participant, intent_id: str) -> None:
        with self.db.write() as s:
            intent = intent_repo.get(s, intent_id)
            if intent is None or intent.event_id != participant.event_id:
                raise NotFoundError()
            wanted = s.get(ClothingModel, intent.wanted_clothing_id)
            if wanted is None:
                raise NotFoundError()
            is_sender = intent.participant_id == participant.id
            is_receiver = wanted.owner_id == participant.id
            if not is_sender and not is_receiver:
                raise NotFoundError()
            if not is_sender:
                raise ForbiddenError()
            if intent.status in _INACTIVE_REPLAY:
                return
            event = event_repo.get(s, intent.event_id)
            if event is None:
                raise NotFoundError()
            if event.status == EventStatus.CLOSED:
                raise EventClosedError()
            now = self.clock()
            intent.status = "withdrawn"
            intent.updated_at = now
            s.flush()
            self._invalidate_dependents(s, intent, now)
        logger.info(
            "intent_withdrawn",
            extra={"intent_id": intent_id, "event_id": intent.event_id},
        )

    def _invalidate_dependents(self, s: Session, intent: ExchangeIntent, now: datetime) -> int:
        stmt = (
            select(TradeProposal)
            .join(
                TradeParticipant,
                TradeParticipant.proposal_id == TradeProposal.id,
            )
            .where(
                TradeProposal.event_id == intent.event_id,
                TradeProposal.status == "pending",
                TradeParticipant.participant_id == intent.participant_id,
                TradeParticipant.offered_clothing_id == intent.offered_clothing_id,
                TradeParticipant.received_clothing_id == intent.wanted_clothing_id,
            )
        )
        proposals = list(s.scalars(stmt))
        seen: set[str] = set()
        count = 0
        for proposal in proposals:
            if proposal.id in seen:
                continue
            seen.add(proposal.id)
            proposal.status = "invalidated"
            proposal.end_reason = "intent_changed"
            proposal.ended_at = now
            count += 1
        if count:
            s.flush()
        return count

    def _recalculate_cycles(
        self, s: Session, event: Event, new_intent: ExchangeIntent, now: datetime
    ) -> None:
        active = list(
            s.scalars(
                select(ExchangeIntent).where(
                    ExchangeIntent.event_id == event.id,
                    ExchangeIntent.status == "active",
                )
            )
        )
        if len(active) < 2:
            return
        clothing_ids = {
            c for intent in active for c in (intent.offered_clothing_id, intent.wanted_clothing_id)
        }
        clothes = (
            {
                row.id: row
                for row in s.scalars(
                    select(ClothingModel).where(ClothingModel.id.in_(clothing_ids))
                )
            }
            if clothing_ids
            else {}
        )
        legs: list[tuple[str, str, str]] = []
        leg_to_intent: dict[tuple[str, str, str], ExchangeIntent] = {}
        for intent in active:
            offered = clothes.get(intent.offered_clothing_id)
            wanted = clothes.get(intent.wanted_clothing_id)
            if offered is None or wanted is None:
                continue
            if (
                offered.status != ClothingStatus.AVAILABLE
                or wanted.status != ClothingStatus.AVAILABLE
            ):
                continue
            leg = (
                intent.participant_id,
                intent.offered_clothing_id,
                intent.wanted_clothing_id,
            )
            legs.append(leg)
            leg_to_intent.setdefault(leg, intent)
        new_leg = (
            new_intent.participant_id,
            new_intent.offered_clothing_id,
            new_intent.wanted_clothing_id,
        )
        if new_leg not in leg_to_intent:
            return
        for cycle in detect_cycles(legs):
            if new_leg not in cycle:
                continue
            key = cycle_key(cycle)
            pending = s.scalar(
                select(TradeProposal).where(
                    TradeProposal.event_id == event.id,
                    TradeProposal.cycle_key == key,
                    TradeProposal.status == "pending",
                )
            )
            if pending is not None:
                continue
            latest = s.scalar(
                select(TradeProposal)
                .where(
                    TradeProposal.event_id == event.id,
                    TradeProposal.cycle_key == key,
                )
                .order_by(TradeProposal.version.desc())
            )
            if (
                latest is not None
                and latest.status in ("rejected", "cancelled")
                and latest.ended_at is not None
                and self._is_suppressed_cycle(s, latest, cycle, leg_to_intent, clothes)
            ):
                continue
            version = latest.version + 1 if latest is not None else 1
            proposal = TradeProposal(
                id=str(uuid4()),
                event_id=event.id,
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
            for leg in cycle:
                offered_clothing = clothes.get(leg[1])
                if offered_clothing is None:
                    continue
                s.add(
                    TradeParticipant(
                        id=str(uuid4()),
                        proposal_id=proposal.id,
                        participant_id=leg[0],
                        offered_clothing_id=leg[1],
                        offered_content_version=offered_clothing.content_version,
                        received_clothing_id=leg[2],
                        response="pending",
                        responded_at=None,
                        is_confirmed=False,
                    )
                )
            s.flush()

    def _is_suppressed_cycle(
        self,
        s: Session,
        latest: TradeProposal,
        cycle: list[tuple[str, str, str]],
        leg_to_intent: dict[tuple[str, str, str], ExchangeIntent],
        clothes: dict[str, ClothingModel],
    ) -> bool:
        if latest.ended_at is None:
            return False
        ordered = sorted(cycle)
        intent_ats: list[datetime] = []
        current_versions: list[int] = []
        for leg in ordered:
            intent = leg_to_intent.get(leg)
            clothing = clothes.get(leg[1])
            if intent is None or clothing is None:
                return False
            intent_ats.append(intent.updated_at)
            current_versions.append(clothing.content_version)
        parts = list(
            s.scalars(select(TradeParticipant).where(TradeParticipant.proposal_id == latest.id))
        )
        parts_sorted = sorted(parts, key=lambda p: p.participant_id)
        proposal_versions = [p.offered_content_version for p in parts_sorted]
        return is_suppressed(
            latest.status,
            latest.ended_at,
            intent_ats,
            current_versions,
            proposal_versions,
        )

    def _build_intent(self, s: Session, intent: ExchangeIntent, event: Event) -> Intent:
        clothing_ids = [intent.offered_clothing_id, intent.wanted_clothing_id]
        clothes = {
            row.id: row
            for row in s.scalars(select(ClothingModel).where(ClothingModel.id.in_(clothing_ids)))
        }
        offered = clothes.get(intent.offered_clothing_id)
        wanted = clothes.get(intent.wanted_clothing_id)
        if offered is None or wanted is None:
            raise NotFoundError()
        owner_ids = {offered.owner_id, wanted.owner_id}
        participants = {
            row.id: row
            for row in s.scalars(select(Participant).where(Participant.id.in_(owner_ids)))
        }
        photo_map = photo_repo.photos_for(s, clothing_ids)
        return Intent(
            id=intent.id,
            event_id=intent.event_id,
            participant_id=intent.participant_id,
            offered_clothing=self._build_summary(
                offered, participants.get(offered.owner_id), event, photo_map
            ),
            wanted_clothing=self._build_summary(
                wanted, participants.get(wanted.owner_id), event, photo_map
            ),
            status=intent.status,
            accepted_proposal_id=intent.accepted_proposal_id,
            created_at=intent.created_at,
            updated_at=intent.updated_at,
        )

    def _build_summary(
        self,
        clothing: ClothingModel,
        owner: Participant | None,
        event: Event,
        photo_map: dict[str, list[PhotoModel]],
    ) -> ClothingSummary:
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
            photo_url=photo_url(self.settings.app_base_url, first.id) if first else "",
            category=ClothingCategory(clothing.category),
            title=clothing.title,
            description=clothing.description,
            status=ClothingStatus(clothing.status),
            content_version=clothing.content_version,
        )
