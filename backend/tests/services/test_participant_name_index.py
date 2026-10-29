import pytest
from sqlalchemy.exc import IntegrityError

from app.schemas.event import EventCreate
from app.services.event import EventService
from tests.conftest import add_participant


@pytest.fixture
def event_ids(db, settings):
    service = EventService(db, settings)
    first = service.create(EventCreate(name="First", organizer_display_name="Mina"))
    second = service.create(EventCreate(name="Second", organizer_display_name="Joon"))
    return first.event.id, second.event.id


def test_same_event_ascii_case_duplicate_is_rejected(db, event_ids):
    add_participant(db, event_ids[0], "Ana")

    with pytest.raises(IntegrityError):
        add_participant(db, event_ids[0], "ANA")


def test_different_events_allow_ascii_case_duplicate(db, event_ids):
    add_participant(db, event_ids[0], "Ana")

    participant, _ = add_participant(db, event_ids[1], "ANA")
    assert participant.display_name == "ANA"


def test_index_allows_non_ascii_casefold_pair(db, event_ids):
    add_participant(db, event_ids[0], "Straße")

    participant, _ = add_participant(db, event_ids[0], "STRASSE")
    assert participant.display_name == "STRASSE"
