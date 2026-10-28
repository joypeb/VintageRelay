from typing import Annotated, cast

from fastapi import Depends, Request

from app.core.config import Settings
from app.core.db import Db
from app.services.event import EventService


def get_settings_dep(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def get_db(request: Request) -> Db:
    return cast(Db, request.app.state.db)


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
DbDep = Annotated[Db, Depends(get_db)]


def get_event_service(db: DbDep, settings: SettingsDep) -> EventService:
    return EventService(db, settings)


EventServiceDep = Annotated[EventService, Depends(get_event_service)]
