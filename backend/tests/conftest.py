from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select, table, update

from app.core.config import Settings
from app.core.db import Db
from app.core.security import generate_participant_token, hash_participant_token
from app.domain.enums import EventStatus
from app.main import create_app
from app.models.base import Base
from app.models.event import Event
from app.models.participant import Participant


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        app_base_url="https://vintage-relay.test",
    )


@pytest.fixture
def db(settings: Settings) -> Iterator[Db]:
    database = Db(settings.database_url)
    Base.metadata.create_all(database.write_engine)
    try:
        yield database
    finally:
        database.dispose()


@pytest.fixture
def app(settings: Settings, db: Db) -> FastAPI:
    return create_app(settings, db)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def client_no_raise(app: FastAPI) -> Iterator[TestClient]:
    try:
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


def count_rows(db: Db, table_name: str) -> int:
    with db.read() as session:
        return session.execute(select(func.count()).select_from(table(table_name))).scalar_one()


def add_participant(db: Db, event_id: str, display_name: str) -> tuple[Participant, str]:
    token = generate_participant_token()
    participant = Participant(
        id=str(uuid4()),
        event_id=event_id,
        display_name=display_name,
        session_token_hash=hash_participant_token(token),
        created_at=datetime.now(UTC),
    )
    with db.write() as session:
        session.add(participant)
    return participant, token


def close_event(db: Db, event_id: str, closed_at: datetime) -> None:
    with db.write() as session:
        session.execute(
            update(Event)
            .where(Event.id == event_id)
            .values(status=EventStatus.CLOSED, closed_at=closed_at)
        )
