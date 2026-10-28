import logging

import pytest
from sqlalchemy import text

import app.models  # noqa: F401
from tests.conftest import count_rows


def fail(*args, **kwargs):
    raise RuntimeError("injected failure")


@pytest.mark.parametrize(
    "target", ["app.repositories.event.set_organizer", "app.services.event.build_event_session"]
)
def test_failure_during_create_rolls_back_without_success_log(
    target, monkeypatch, db, settings, caplog
):
    from app.schemas.event import EventCreate
    from app.services.event import EventService

    caplog.set_level(logging.INFO)
    monkeypatch.setattr(target, fail)

    with pytest.raises(RuntimeError, match="injected failure"):
        EventService(db, settings).create(EventCreate(name="Swap", organizer_display_name="Mina"))

    assert count_rows(db, "events") == count_rows(db, "participants") == 0
    assert not any(record.msg == "event_created" for record in caplog.records)


def test_successful_creates_link_each_event_to_its_own_organizer(db, settings):
    from app.schemas.event import EventCreate
    from app.services.event import EventService

    service = EventService(db, settings)
    for _ in range(3):
        service.create(EventCreate(name="Swap", organizer_display_name="Mina"))

    with db.read() as session:
        rows = session.execute(
            text(
                "SELECT e.id, e.organizer_participant_id, p.event_id FROM events e "
                "LEFT JOIN participants p ON p.id = e.organizer_participant_id"
            )
        ).all()
    assert len(rows) == 3
    assert all(
        organizer_id is not None and event_id == participant_event_id
        for event_id, organizer_id, participant_event_id in rows
    )
