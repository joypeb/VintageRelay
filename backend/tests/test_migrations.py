import re
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.exc import IntegrityError

from alembic import command
from app.models.event import Event
from app.models.participant import Participant


def test_upgrade_empty_database_creates_event_schema(tmp_path):
    backend = Path(__file__).resolve().parents[1]
    url = f"sqlite:///{tmp_path / 'm.db'}"
    cfg = Config(str(backend / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)

    command.upgrade(cfg, "head")

    engine = create_engine(url)
    try:
        inspector = inspect(engine)
        assert {"events", "participants"} <= set(inspector.get_table_names())
        assert any(
            c["column_names"] == ["entry_code"] for c in inspector.get_unique_constraints("events")
        )
        assert any(
            c["column_names"] == ["session_token_hash"]
            for c in inspector.get_unique_constraints("participants")
        )
        assert any(
            c["name"] == "ck_events_status" for c in inspector.get_check_constraints("events")
        )
        assert next(
            c for c in inspector.get_columns("events") if c["name"] == "organizer_participant_id"
        )["nullable"]
        assert any(
            fk["constrained_columns"] == ["organizer_participant_id"]
            and fk["referred_table"] == "participants"
            and fk["referred_columns"] == ["id"]
            for fk in inspector.get_foreign_keys("events")
        )
        assert any(
            fk["constrained_columns"] == ["event_id"]
            and fk["referred_table"] == "events"
            and fk["referred_columns"] == ["id"]
            for fk in inspector.get_foreign_keys("participants")
        )
    finally:
        engine.dispose()


@pytest.fixture
def migrated_database(tmp_path):
    backend = Path(__file__).resolve().parents[1]
    url = f"sqlite:///{tmp_path / 'index.db'}"
    cfg = Config(str(backend / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    engine = create_engine(url)

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys = ON")

    try:
        yield cfg, engine
    finally:
        engine.dispose()


def index_sql(engine):
    with engine.connect() as connection:
        return connection.execute(
            text(
                "SELECT sql FROM sqlite_master WHERE type = 'index' "
                "AND name = :name AND tbl_name = 'participants'"
            ),
            {"name": "uq_participants_event_id_display_name_lower"},
        ).scalar_one_or_none()


def test_migration_creates_unique_case_insensitive_participant_name_index(migrated_database):
    _, engine = migrated_database
    sql = index_sql(engine)
    assert sql is not None
    normalized = re.sub(r"\s+", "", sql).lower()
    assert "unique" in normalized
    assert "event_id" in normalized
    assert "lower(display_name)" in normalized


def test_migration_enforces_case_insensitive_names_within_event(migrated_database):
    _, engine = migrated_database
    now = datetime.now(UTC)
    with engine.begin() as connection:
        connection.execute(
            Event.__table__.insert(),
            [
                {
                    "id": "event-1",
                    "name": "First",
                    "status": "active",
                    "entry_code": "111111",
                    "created_at": now,
                },
                {
                    "id": "event-2",
                    "name": "Second",
                    "status": "active",
                    "entry_code": "222222",
                    "created_at": now,
                },
            ],
        )
        connection.execute(
            Participant.__table__.insert(),
            {
                "id": "p1",
                "event_id": "event-1",
                "display_name": "Ana",
                "session_token_hash": "hash1",
                "created_at": now,
            },
        )
        connection.execute(
            Participant.__table__.insert(),
            {
                "id": "p2",
                "event_id": "event-2",
                "display_name": "ANA",
                "session_token_hash": "hash2",
                "created_at": now,
            },
        )
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(
            Participant.__table__.insert(),
            {
                "id": "p3",
                "event_id": "event-1",
                "display_name": "ANA",
                "session_token_hash": "hash3",
                "created_at": now,
            },
        )


def test_downgrade_removes_participant_name_index(migrated_database):
    cfg, engine = migrated_database
    assert index_sql(engine) is not None
    command.downgrade(cfg, "ee1be11dd5a7")
    assert index_sql(engine) is None
