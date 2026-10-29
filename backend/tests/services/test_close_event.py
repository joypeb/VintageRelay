from datetime import UTC, datetime

import pytest
from sqlalchemy import text

import app.api.deps as deps
from app.domain.errors import AppError
from app.models.participant import Participant
from app.schemas.event import EventCreate
from app.services.event import EventService
from tests.conftest import add_participant, close_event


@pytest.fixture
def organizer_context(db, settings):
    service = EventService(db, settings)
    event = service.create(EventCreate(name="Swap", organizer_display_name="Mina"))
    other = service.create(EventCreate(name="Other", organizer_display_name="Alex"))
    participant, _ = add_participant(db, event.event.id, "Joon")
    with db.read() as session:
        organizer = session.get(Participant, event.event.organizer_participant_id)
        other_organizer = session.get(Participant, other.event.organizer_participant_id)
    assert organizer is not None
    assert other_organizer is not None
    return service, event.event.id, other.event.id, organizer, participant, other_organizer


def snapshot(db):
    with db.read() as session:
        events = session.execute(text("SELECT * FROM events ORDER BY id")).all()
        participants = session.execute(text("SELECT * FROM participants ORDER BY id")).all()
    return events, participants


@pytest.mark.parametrize("gate", ["service", "dependency"])
@pytest.mark.parametrize(
    ("case", "closed", "expected_code"),
    [
        ("organizer", False, None),
        ("organizer", True, None),
        ("participant", False, "FORBIDDEN"),
        ("participant", True, "FORBIDDEN"),
        ("other_event", False, "NOT_FOUND"),
        ("missing", False, "NOT_FOUND"),
        ("malformed", False, "NOT_FOUND"),
    ],
)
def test_organizer_gate_is_scoped_and_read_only(
    db, organizer_context, gate, case, closed, expected_code
):
    service, event_id, other_id, organizer, participant, other_organizer = organizer_context
    if closed:
        close_event(db, event_id, datetime(2026, 10, 29, tzinfo=UTC))

    actor = participant if case == "participant" else organizer
    if case == "other_event":
        actor = other_organizer
    target = {
        "other_event": event_id,
        "missing": "00000000-0000-4000-8000-000000000000",
        "malformed": "not-a-valid-event-id",
    }.get(case, event_id)
    assert other_id != event_id
    before = snapshot(db)

    def invoke():
        if gate == "service":
            return service.require_organizer(actor, target)
        return deps.require_organizer(event_id=target, actor=actor, service=service)

    try:
        if expected_code is None:
            invoke()
        else:
            with pytest.raises(AppError) as error:
                invoke()
            assert error.value.code == expected_code
            assert error.value.status_code == (403 if expected_code == "FORBIDDEN" else 404)
    finally:
        assert snapshot(db) == before
