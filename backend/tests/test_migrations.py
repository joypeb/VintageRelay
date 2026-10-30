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


def test_migration_creates_photos_table(migrated_database):
    _, engine = migrated_database
    inspector = inspect(engine)
    assert "photos" in inspector.get_table_names()
    assert {column["name"] for column in inspector.get_columns("photos")} == {
        "id",
        "event_id",
        "uploader_id",
        "storage_location",
        "content_type",
        "size_bytes",
        "created_at",
        "clothing_id",
        "position",
    }
    assert any(
        constraint["column_names"] == ["storage_location"]
        for constraint in inspector.get_unique_constraints("photos")
    )


def test_downgrade_removes_photos_table(migrated_database):
    cfg, engine = migrated_database
    assert "photos" in inspect(engine).get_table_names()
    command.downgrade(cfg, "8e658c89f7b9")
    assert "photos" not in inspect(engine).get_table_names()


def test_migration_creates_clothes_table_and_index(migrated_database):
    _, engine = migrated_database
    inspector = inspect(engine)
    assert "clothes" in inspector.get_table_names()
    assert {column["name"] for column in inspector.get_columns("clothes")} == {
        "id",
        "event_id",
        "owner_id",
        "description",
        "status",
        "content_version",
        "created_at",
        "updated_at",
        "title",
        "category",
        "measure_total_length",
        "measure_chest",
        "measure_shoulder",
        "measure_sleeve",
        "measure_waist",
        "measure_hem",
        "measure_inseam",
        "measure_thigh",
    }
    assert any(
        index["name"] == "ix_clothes_event_id_created_at"
        and index["column_names"] == ["event_id", "created_at"]
        for index in inspector.get_indexes("clothes")
    )


def seed_clothing_foreign_keys(engine):
    now = datetime.now(UTC)
    with engine.begin() as connection:
        connection.execute(
            Event.__table__.insert(),
            {
                "id": "event-1",
                "name": "Market",
                "status": "active",
                "entry_code": "111111",
                "created_at": now,
            },
        )
        connection.execute(
            Participant.__table__.insert(),
            {
                "id": "participant-1",
                "event_id": "event-1",
                "display_name": "Mina",
                "session_token_hash": "hash1",
                "created_at": now,
            },
        )
        connection.execute(
            text(
                "INSERT INTO photos (id, event_id, uploader_id, storage_location, content_type, "
                "size_bytes, created_at) VALUES (:id, :event_id, :uploader_id, :location, "
                ":content_type, :size_bytes, :created_at)"
            ),
            {
                "id": "photo-1",
                "event_id": "event-1",
                "uploader_id": "participant-1",
                "location": "photo.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 123,
                "created_at": now,
            },
        )
    return now


def insert_clothing(connection, clothing_id, status, now, category="outer"):
    connection.execute(
        text(
            "INSERT INTO clothes (id, event_id, owner_id, description, status, content_version, "
            "created_at, updated_at, title, category) VALUES "
            "(:id, 'event-1', 'participant-1', 'Jacket', "
            ":status, 1, :now, :now, 'Jacket', :category)"
        ),
        {"id": clothing_id, "status": status, "now": now, "category": category},
    )


def test_migration_photos_reference_clothes_and_reject_duplicate_position(migrated_database):
    _, engine = migrated_database
    inspector = inspect(engine)
    columns = {column["name"]: column for column in inspector.get_columns("photos")}
    assert columns["clothing_id"]["nullable"] and columns["position"]["nullable"]
    assert any(
        fk["constrained_columns"] == ["clothing_id"]
        and fk["referred_table"] == "clothes"
        and fk["referred_columns"] == ["id"]
        for fk in inspector.get_foreign_keys("photos")
    )
    assert any(
        c["column_names"] == ["clothing_id", "position"]
        for c in inspector.get_unique_constraints("photos")
    )
    now = seed_clothing_foreign_keys(engine)
    with engine.begin() as connection:
        insert_clothing(connection, "clothing-1", "available", now)
        connection.execute(
            text("UPDATE photos SET clothing_id='clothing-1', position=0 WHERE id='photo-1'")
        )
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO photos (id,event_id,uploader_id,storage_location,content_type,"
                "size_bytes,created_at,clothing_id,position) VALUES "
                "('photo-2','event-1','participant-1','two.jpg','image/jpeg',123,:now,'clothing-1',0)"
            ),
            {"now": now},
        )


def test_migration_rejects_invalid_clothing_status(migrated_database):
    _, engine = migrated_database
    now = seed_clothing_foreign_keys(engine)
    with pytest.raises(IntegrityError, match="ck_clothes_status"), engine.begin() as connection:
        insert_clothing(connection, "clothing-1", "invalid", now)


def test_migration_backfills_and_downgrade_restores_main_photo(tmp_path):
    backend = Path(__file__).resolve().parents[1]
    url = f"sqlite:///{tmp_path / 'backfill.db'}"
    cfg = Config(str(backend / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "bf5a4ccaa2c0")
    engine = create_engine(url)
    try:
        now = seed_clothing_foreign_keys(engine)
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO clothes (id,event_id,owner_id,photo_id,description,status,"
                    "content_version,created_at,updated_at) VALUES "
                    "('clothing-1','event-1','participant-1','photo-1','Jacket','available',1,:now,:now)"
                ),
                {"now": now},
            )
        command.upgrade(cfg, "head")
        with engine.connect() as connection:
            assert connection.execute(
                text("SELECT clothing_id, position FROM photos WHERE id='photo-1'")
            ).one() == ("clothing-1", 0)
        command.downgrade(cfg, "bf5a4ccaa2c0")
        with engine.connect() as connection:
            assert (
                connection.execute(
                    text("SELECT photo_id FROM clothes WHERE id='clothing-1'")
                ).scalar_one()
                == "photo-1"
            )
    finally:
        engine.dispose()


def test_downgrade_removes_clothes_table(migrated_database):
    cfg, engine = migrated_database
    assert "clothes" in inspect(engine).get_table_names()
    command.downgrade(cfg, "d04c8b6d5381")
    assert "clothes" not in inspect(engine).get_table_names()


def test_migration_adds_clothing_category_title_and_measurements(migrated_database):
    _, engine = migrated_database
    columns = {column["name"]: column for column in inspect(engine).get_columns("clothes")}
    for name, length in (("title", 100), ("category", 16)):
        assert columns[name]["type"].length == length
        assert not columns[name]["nullable"]
    for name in (
        "measure_total_length",
        "measure_chest",
        "measure_shoulder",
        "measure_sleeve",
        "measure_waist",
        "measure_hem",
        "measure_inseam",
        "measure_thigh",
    ):
        assert columns[name]["nullable"]


def test_migration_rejects_invalid_clothing_category(migrated_database):
    _, engine = migrated_database
    now = seed_clothing_foreign_keys(engine)
    with pytest.raises(IntegrityError, match="ck_clothes_category"), engine.begin() as connection:
        insert_clothing(connection, "clothing-1", "available", now, category="invalid")


def test_downgrade_removes_clothing_category_title_and_measurements(migrated_database):
    cfg, engine = migrated_database
    added_columns = {
        "title",
        "category",
        "measure_total_length",
        "measure_chest",
        "measure_shoulder",
        "measure_sleeve",
        "measure_waist",
        "measure_hem",
        "measure_inseam",
        "measure_thigh",
    }
    assert added_columns <= {column["name"] for column in inspect(engine).get_columns("clothes")}
    command.downgrade(cfg, "c9f3e2a4b1d7")
    assert added_columns.isdisjoint(
        column["name"] for column in inspect(engine).get_columns("clothes")
    )
