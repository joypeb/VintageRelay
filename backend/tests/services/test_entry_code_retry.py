from unittest.mock import Mock

import pytest
from sqlalchemy import select

from app.api.deps import get_event_service
from app.domain.errors import InternalError
from app.models.event import Event
from app.schemas.event import EventCreate
from app.services.event import EventService
from tests.conftest import count_rows


def test_collision_followed_by_available_code_stores_available_code(settings, db):
    body = EventCreate(name="Swap", organizer_display_name="Mina")
    EventService(db, settings, entry_code_generator=lambda: "AAAAAA").create(body)
    codes = iter(["AAAAAA", "BBBBBB"])
    service = EventService(db, settings, entry_code_generator=lambda: next(codes))

    result = service.create(body)

    with db.read() as session:
        stored_code = session.execute(
            select(Event.entry_code).where(Event.id == result.event.id)
        ).scalar_one()
    assert stored_code == "BBBBBB"


def test_exhausted_collisions_raise_internal_error_without_writes(settings, db):
    body = EventCreate(name="Swap", organizer_display_name="Mina")
    EventService(db, settings, entry_code_generator=lambda: "AAAAAA").create(body)
    counts = (count_rows(db, "events"), count_rows(db, "participants"))
    generator = Mock(return_value="AAAAAA")
    service = EventService(db, settings, entry_code_generator=generator)

    with pytest.raises(InternalError):
        service.create(body)

    assert generator.call_count == 10
    assert (count_rows(db, "events"), count_rows(db, "participants")) == counts


def test_api_exhausted_collisions_returns_internal_error_without_writes(
    settings, db, app, client_no_raise
):
    body = EventCreate(name="Swap", organizer_display_name="Mina")
    EventService(db, settings, entry_code_generator=lambda: "AAAAAA").create(body)
    counts = (count_rows(db, "events"), count_rows(db, "participants"))
    generator = Mock(return_value="AAAAAA")
    service = EventService(db, settings, entry_code_generator=generator)
    app.dependency_overrides[get_event_service] = lambda: service

    response = client_no_raise.post(
        "/api/v1/events", json={"name": "Swap", "organizerDisplayName": "Mina"}
    )

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert generator.call_count == 10
    assert (count_rows(db, "events"), count_rows(db, "participants")) == counts
