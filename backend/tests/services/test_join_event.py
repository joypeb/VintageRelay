import logging
from datetime import UTC, datetime

import pytest
from sqlalchemy import select, text

from app.core.security import hash_participant_token
from app.domain.errors import DisplayNameTakenError
from app.models.participant import Participant
from app.schemas.event import EventCreate
from app.services.event import EventService
from tests.conftest import count_rows


def setup_join(db, settings):
    service = EventService(db, settings)
    created = service.create(EventCreate(name="Swap", organizer_display_name="Mina"))
    return service, created.event


def body(code, name):
    from app.schemas.event import ParticipantCreate

    return ParticipantCreate(entry_code=code, display_name=name)


def test_join_stores_hashed_token_and_clock_without_changing_event(db, settings):
    service, event = setup_join(db, settings)
    fixed = datetime(2026, 10, 29, 9, tzinfo=UTC)
    token = "injected-token"
    service.clock = lambda: fixed
    service.token_generator = lambda: token
    with db.read() as session:
        before = session.execute(
            text("SELECT * FROM events WHERE id = :id"), {"id": event.id}
        ).one()
    result = service.join(event.id, body(event.entry_code, "Joon"))
    with db.read() as session:
        after = session.execute(text("SELECT * FROM events WHERE id = :id"), {"id": event.id}).one()
        participants = session.scalars(
            select(Participant).where(Participant.event_id == event.id)
        ).all()
    assert before == after
    assert len(participants) == 2
    participant = next(p for p in participants if p.id == result.event.me.participant_id)
    assert participant.session_token_hash == hash_participant_token(token) != token
    assert participant.created_at.replace(tzinfo=UTC) == fixed
    assert result.participant_token == token


def test_join_failure_after_flush_rolls_back_and_retry_succeeds(db, settings, monkeypatch, caplog):
    from app.repositories import participant as participant_repo

    service, event = setup_join(db, settings)
    payload = body(event.entry_code, "Joon")
    before = count_rows(db, "participants")
    original = participant_repo.add
    caplog.set_level(logging.INFO, logger="app.services.event")

    def add_then_fail(session, participant):
        original(session, participant)
        raise RuntimeError("injected failure")

    with monkeypatch.context() as patch:
        patch.setattr(participant_repo, "add", add_then_fail)
        with pytest.raises(RuntimeError, match="injected failure"):
            service.join(event.id, payload)
    assert count_rows(db, "participants") == before
    assert not [r for r in caplog.records if r.getMessage() == "participant_joined"]
    service.join(event.id, payload)
    assert count_rows(db, "participants") == before + 1
    assert len([r for r in caplog.records if r.getMessage() == "participant_joined"]) == 1


def test_join_rejects_unicode_casefold_duplicate(db, settings):
    service, event = setup_join(db, settings)
    service.join(event.id, body(event.entry_code, "Straße"))
    before = count_rows(db, "participants")
    with pytest.raises(DisplayNameTakenError):
        service.join(event.id, body(event.entry_code, "STRASSE"))
    assert count_rows(db, "participants") == before
