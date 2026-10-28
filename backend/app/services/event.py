import logging
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import uuid4

from app.core.config import Settings
from app.core.db import Db
from app.core.security import generate_participant_token, hash_participant_token
from app.domain.entry_code import generate_entry_code
from app.domain.enums import EventStatus
from app.domain.errors import InternalError
from app.models.event import Event
from app.models.participant import Participant
from app.repositories import event as event_repo
from app.repositories import participant as participant_repo
from app.schemas.event import EventCreate, EventMe, EventRead, EventSession, EventStats

logger = logging.getLogger(__name__)

ENTRY_CODE_MAX_ATTEMPTS = 10


def build_event_session(
    event: Event, organizer: Participant, token: str, settings: Settings
) -> EventSession:
    return EventSession(
        event=EventRead(
            id=event.id,
            name=event.name,
            status=EventStatus(event.status),
            entry_code=event.entry_code,
            entry_url=f"{settings.app_base_url}/join?code={event.entry_code}",
            organizer_participant_id=organizer.id,
            created_at=event.created_at,
            closed_at=event.closed_at,
            me=EventMe(
                participant_id=organizer.id,
                display_name=organizer.display_name,
                is_organizer=True,
            ),
            stats=EventStats(
                participant_count=1, available_clothing_count=0, confirmed_exchange_count=0
            ),
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
