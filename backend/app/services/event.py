import hmac
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.db import Db
from app.core.security import generate_participant_token, hash_participant_token
from app.domain.entry_code import generate_entry_code, normalize_entry_code
from app.domain.enums import EventStatus
from app.domain.errors import (
    DisplayNameTakenError,
    EntryCodeNotFoundError,
    EventClosedError,
    ForbiddenError,
    InternalError,
    NotFoundError,
)
from app.models.event import Event
from app.models.participant import Participant
from app.repositories import clothing as clothing_repo
from app.repositories import event as event_repo
from app.repositories import participant as participant_repo
from app.schemas.event import (
    EntryCodePreview,
    EventCreate,
    EventMe,
    EventRead,
    EventSession,
    EventStats,
    ParticipantCreate,
)

logger = logging.getLogger(__name__)

ENTRY_CODE_MAX_ATTEMPTS = 10


def build_event_read(
    event: Event, me: Participant, stats: EventStats | None, settings: Settings
) -> EventRead:
    if event.organizer_participant_id is None:
        raise InternalError()
    return EventRead(
        id=event.id,
        name=event.name,
        status=EventStatus(event.status),
        entry_code=event.entry_code,
        entry_url=f"{settings.app_base_url}/join?code={event.entry_code}",
        organizer_participant_id=event.organizer_participant_id,
        created_at=event.created_at,
        closed_at=event.closed_at,
        me=EventMe(
            participant_id=me.id,
            display_name=me.display_name,
            is_organizer=me.id == event.organizer_participant_id,
        ),
        stats=stats,
    )


def build_event_session(
    event: Event, organizer: Participant, token: str, settings: Settings
) -> EventSession:
    return EventSession(
        event=build_event_read(
            event=event,
            me=organizer,
            stats=EventStats(
                participant_count=1, available_clothing_count=0, confirmed_exchange_count=0
            ),
            settings=settings,
        ),
        participant_token=token,
    )


class EventService:
    def __init__(
        self,
        db: Db,
        settings: Settings,
        *,
        entry_code_generator: Callable[[], str] = generate_entry_code,
        token_generator: Callable[[], str] = generate_participant_token,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.db = db
        self.settings = settings
        self.entry_code_generator = entry_code_generator
        self.token_generator = token_generator
        self.clock = clock

    def lookup_entry_code(self, code: str) -> EntryCodePreview:
        with self.db.read() as s:
            event = event_repo.get_by_entry_code(s, normalize_entry_code(code))
            if event is None:
                raise EntryCodeNotFoundError()
            return EntryCodePreview(
                event_id=event.id, name=event.name, status=EventStatus(event.status)
            )

    def require_organizer(self, actor: Participant, event_id: str) -> Participant:
        with self.db.read() as s:
            self._organizer_event(s, actor, event_id)
            return actor

    def join(self, event_id: str, body: ParticipantCreate) -> EventSession:
        with self.db.write() as s:
            event = event_repo.get(s, event_id)
            if event is None:
                raise EntryCodeNotFoundError()
            # Verify the code before disclosing closure (Join Event API, processing rules).
            if not hmac.compare_digest(
                normalize_entry_code(body.entry_code).encode(), event.entry_code.encode()
            ):
                raise EntryCodeNotFoundError()
            if event.status == EventStatus.CLOSED:
                raise EventClosedError("This event has ended, so you can't join it.")
            names = participant_repo.list_display_names(s, event.id)
            if body.display_name.casefold() in {name.casefold() for name in names}:
                raise DisplayNameTakenError(details={"field": "displayName"})
            token = self.token_generator()
            participant = Participant(
                id=str(uuid4()),
                event_id=event.id,
                display_name=body.display_name,
                session_token_hash=hash_participant_token(token),
                created_at=self.clock(),
            )
            try:
                participant_repo.add(s, participant)
            except IntegrityError as exc:
                if "uq_participants_event_id_display_name_lower" in str(exc.orig):
                    raise DisplayNameTakenError(details={"field": "displayName"}) from exc
                raise
            session = EventSession(
                event=build_event_read(event, participant, None, self.settings),
                participant_token=token,
            )
        logger.info(
            "participant_joined",
            extra={"event_id": event.id, "participant_id": participant.id},
        )
        return session

    def _organizer_event(self, s: Session, actor: Participant, event_id: str) -> Event:
        if actor.event_id != event_id:
            raise NotFoundError()
        event = event_repo.get(s, event_id)
        if event is None:
            raise NotFoundError()
        # Organizer authority comes from the event's participant reference (AGENTS.md).
        if actor.id != event.organizer_participant_id:
            raise ForbiddenError()
        return event

    def _read(self, s: Session, event: Event, actor: Participant) -> EventRead:
        stats = None
        if actor.id == event.organizer_participant_id:
            stats = EventStats(
                participant_count=participant_repo.count_by_event(s, event.id),
                available_clothing_count=clothing_repo.count_available(s, event.id),
                # TODO(feature 06/11): count from clothing/proposals
                confirmed_exchange_count=0,
            )
        return build_event_read(event, actor, stats, self.settings)

    def get(self, actor: Participant, event_id: str) -> EventRead:
        with self.db.read() as s:
            event = event_repo.get(s, event_id)
            if event is None:
                raise NotFoundError()
            return self._read(s, event, actor)

    def close(self, actor: Participant, event_id: str) -> EventRead:
        with self.db.write() as s:
            event = self._organizer_event(s, actor, event_id)
            if event.status == EventStatus.CLOSED:
                return self._read(s, event, actor)
            if event_repo.mark_closed(s, event_id, self.clock()) != 1:
                raise InternalError()
            s.refresh(event)
            result = self._read(s, event, actor)
        logger.info(
            "event_closed",
            extra={
                "event_id": event_id,
                "participant_id": actor.id,
                "invalidated_proposal_count": 0,
            },
        )
        return result

    def create(self, body: EventCreate) -> EventSession:
        # Event creation also registers and links its organizer atomically (AGENTS.md).
        with self.db.write() as s:
            for _ in range(ENTRY_CODE_MAX_ATTEMPTS):
                code = self.entry_code_generator()
                if not event_repo.entry_code_exists(s, code):
                    break
            else:
                raise InternalError()
            event = Event(
                id=str(uuid4()),
                name=body.name,
                status=EventStatus.ACTIVE,
                entry_code=code,
                organizer_participant_id=None,
                created_at=self.clock(),
                closed_at=None,
            )
            event_repo.add(s, event)
            token = self.token_generator()
            organizer = Participant(
                id=str(uuid4()),
                event_id=event.id,
                display_name=body.organizer_display_name,
                session_token_hash=hash_participant_token(token),
                created_at=self.clock(),
            )
            participant_repo.add(s, organizer)
            event_repo.set_organizer(s, event, organizer.id)
            session = build_event_session(event, organizer, token, self.settings)
        logger.info("event_created", extra={"event_id": event.id})
        return session
