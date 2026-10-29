import hashlib
import logging

from sqlalchemy import text

import app.models  # noqa: F401
from app.core.security import hash_participant_token


def test_create_persists_trimmed_names_and_only_token_hash(client, db):
    response = client.post(
        "/api/v1/events", json={"name": "  Swap  ", "organizerDisplayName": "  Mina  "}
    )

    assert response.status_code == 201
    token = response.json()["participantToken"]
    with db.read() as session:
        event = session.execute(text("SELECT * FROM events")).mappings().one()
        participants = session.execute(text("SELECT * FROM participants")).mappings().all()
        matched = (
            session.execute(
                text("SELECT * FROM participants WHERE session_token_hash = :token_hash"),
                {"token_hash": hash_participant_token(token)},
            )
            .mappings()
            .all()
        )

    assert len(participants) == len(matched) == 1
    assert participants[0]["session_token_hash"] == hashlib.sha256(token.encode()).hexdigest()
    assert token not in participants[0].values()
    assert matched[0]["id"] == event["organizer_participant_id"]
    assert event["name"] == "Swap"
    assert participants[0]["display_name"] == "Mina"


def test_successful_create_logs_event_without_secrets(client, caplog):
    caplog.set_level(logging.INFO)

    response = client.post("/api/v1/events", json={"name": "Swap", "organizerDisplayName": "Mina"})

    assert response.status_code == 201
    body = response.json()
    records = [record for record in caplog.records if record.msg == "event_created"]
    assert len(records) == 1
    assert records[0].event_id == body["event"]["id"]
    for record in caplog.records:
        for secret in (body["participantToken"], body["event"]["entryCode"]):
            assert secret not in record.getMessage()
            assert secret not in str(record.__dict__.values())


def test_get_returns_correct_actor_and_does_not_write(db, settings):
    from app.models.participant import Participant
    from app.schemas.event import EventCreate, EventRead
    from app.services.event import EventService
    from tests.conftest import add_participant, count_rows

    service = EventService(db, settings)
    created = service.create(EventCreate(name="Swap", organizer_display_name="Mina"))
    participant, _ = add_participant(db, created.event.id, "Joon")
    with db.read() as session:
        organizer = session.get(Participant, created.event.organizer_participant_id)
    assert organizer is not None
    counts = (count_rows(db, "events"), count_rows(db, "participants"))
    organizer_read = service.get(organizer, created.event.id)
    participant_read = service.get(participant, created.event.id)
    assert isinstance(organizer_read, EventRead)
    assert organizer_read.me.is_organizer is True
    assert participant_read.me.is_organizer is False
    assert participant_read.stats is None
    assert counts == (count_rows(db, "events"), count_rows(db, "participants"))


def test_get_missing_event_raises_not_found(db, settings):
    import pytest

    from app.domain.errors import NotFoundError
    from app.schemas.event import EventCreate
    from app.services.event import EventService
    from tests.conftest import add_participant

    service = EventService(db, settings)
    created = service.create(EventCreate(name="Swap", organizer_display_name="Mina"))
    actor, _ = add_participant(db, created.event.id, "Joon")
    with pytest.raises(NotFoundError):
        service.get(actor, "00000000-0000-4000-8000-000000000000")


def test_get_organizer_stats_counts_only_event_participants(db, settings):
    from app.models.participant import Participant
    from app.schemas.event import EventCreate, EventStats
    from app.services.event import EventService
    from tests.conftest import add_participant

    service = EventService(db, settings)
    created = service.create(EventCreate(name="Swap", organizer_display_name="Mina"))
    other = service.create(EventCreate(name="Other", organizer_display_name="Alex"))
    add_participant(db, created.event.id, "Joon")
    add_participant(db, created.event.id, "Sora")
    add_participant(db, other.event.id, "Robin")
    with db.read() as session:
        organizer = session.get(Participant, created.event.organizer_participant_id)
    assert organizer is not None

    result = service.get(organizer, created.event.id)

    assert result.stats == EventStats(
        participant_count=3, available_clothing_count=0, confirmed_exchange_count=0
    )
