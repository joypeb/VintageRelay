from pathlib import Path

from alembic.config import Config
from sqlalchemy import create_engine, inspect

from alembic import command


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
