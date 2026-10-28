from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import Column, Integer, MetaData, String, Table, event, select, text
from sqlalchemy.exc import IntegrityError, InvalidRequestError

from app.core.db import Db
from app.models.base import UtcDateTime


@pytest.fixture
def db(tmp_path: Path) -> Iterator[Db]:
    instance = Db(f"sqlite:///{tmp_path / 'db.sqlite'}")
    yield instance
    instance.dispose()


def test_read_session_applies_sqlite_pragmas(db: Db) -> None:
    with db.read() as session:
        foreign_keys = session.execute(text("PRAGMA foreign_keys")).scalar_one()
        journal_mode = session.execute(text("PRAGMA journal_mode")).scalar_one()
        busy_timeout = session.execute(text("PRAGMA busy_timeout")).scalar_one()

    assert foreign_keys == 1
    assert journal_mode.lower() == "wal"
    assert busy_timeout == 5000


def test_write_context_commits_on_normal_exit(db: Db) -> None:
    with db.write() as session:
        session.execute(text("CREATE TABLE items (value TEXT)"))
        session.execute(text("INSERT INTO items (value) VALUES ('saved')"))

    with db.read() as session:
        values = session.execute(text("SELECT value FROM items")).scalars().all()

    assert values == ["saved"]


def test_write_context_rolls_back_on_exception(db: Db) -> None:
    with db.write() as session:
        session.execute(text("CREATE TABLE items (value TEXT)"))

    with pytest.raises(RuntimeError, match="abort"), db.write() as session:
        session.execute(text("INSERT INTO items (value) VALUES ('discarded')"))
        raise RuntimeError("abort")

    with db.read() as session:
        values = session.execute(text("SELECT value FROM items")).scalars().all()

    assert values == []


def test_write_session_outside_transaction_rejects_execute(db: Db) -> None:
    with db.write() as session:
        pass

    with pytest.raises(InvalidRequestError, match=r"[Aa]utobegin"):
        session.execute(text("SELECT 1"))


def test_utc_datetime_round_trip_restores_utc_timezone(db: Db) -> None:
    metadata = MetaData()
    timestamps = Table(
        "timestamps",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("created_at", UtcDateTime(), nullable=False),
    )
    metadata.create_all(db.write_engine)
    value = datetime(2026, 10, 27, 5, 30, tzinfo=UTC)

    with db.write() as session:
        session.execute(timestamps.insert().values(created_at=value))
    with db.read() as session:
        result = session.execute(select(timestamps.c.created_at)).scalar_one()

    assert result == value
    assert result.tzinfo == UTC


def test_unique_violation_hides_parameter_values(db: Db) -> None:
    metadata = MetaData()
    items = Table("items", metadata, Column("value", String, unique=True))
    metadata.create_all(db.write_engine)
    with db.write() as session:
        session.execute(items.insert().values(value="SECRET123"))

    with pytest.raises(IntegrityError) as exc, db.write() as session:
        session.execute(items.insert().values(value="SECRET123"))

    assert "SECRET123" not in str(exc.value)


def test_dispose_closes_both_engine_pools(db: Db) -> None:
    with db.read() as session:
        read_engine = session.get_bind()
    write_engine = db.write_engine
    disposed: list[object] = []
    event.listen(read_engine, "engine_disposed", lambda engine: disposed.append(engine))
    event.listen(write_engine, "engine_disposed", lambda engine: disposed.append(engine))

    db.dispose()

    assert read_engine is not write_engine
    assert disposed == [read_engine, write_engine] or disposed == [write_engine, read_engine]
