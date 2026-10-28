from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select, table

from app.core.config import Settings
from app.core.db import Db
from app.main import create_app
from app.models.base import Base


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
