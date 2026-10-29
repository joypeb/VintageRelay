from typing import Annotated, cast

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings
from app.core.db import Db
from app.core.security import hash_participant_token
from app.domain.errors import NotFoundError, UnauthenticatedError
from app.models.participant import Participant
from app.repositories import participant as participant_repo
from app.services.event import EventService


def get_settings_dep(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def get_db(request: Request) -> Db:
    return cast(Db, request.app.state.db)


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
DbDep = Annotated[Db, Depends(get_db)]

bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="participantToken",
    description="participantToken from event creation or join",
)


def get_current_participant(
    event_id: str,
    db: DbDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> Participant:
    if credentials is None or not credentials.credentials.strip():
        raise UnauthenticatedError()
    with db.read() as s:
        participant = participant_repo.get_by_token_hash(
            s, hash_participant_token(credentials.credentials)
        )
        if participant is None:
            raise UnauthenticatedError()
        if participant.event_id != event_id:
            raise NotFoundError()
        return participant


CurrentParticipant = Annotated[Participant, Depends(get_current_participant)]


def get_event_service(db: DbDep, settings: SettingsDep) -> EventService:
    return EventService(db, settings)


EventServiceDep = Annotated[EventService, Depends(get_event_service)]
