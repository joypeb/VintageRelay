from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.schemas.event import EventCreate
from app.services.event import EventService


@pytest.fixture
def photo_types():
    from app.models.photo import Photo
    from app.repositories import photo as photo_repo

    return Photo, photo_repo


@pytest.fixture
def photo_context(photo_types, db, settings):
    event = (
        EventService(db, settings)
        .create(EventCreate(name="Market", organizer_display_name="Mina"))
        .event
    )
    return photo_types, db, event


def test_photo_repository_add_and_get_round_trip(photo_context):
    (photo_model, photo_repo), db, event = photo_context
    now = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
    photo = photo_model(
        id=str(uuid4()),
        event_id=event.id,
        uploader_id=event.organizer_participant_id,
        storage_location="photo.jpg",
        content_type="image/jpeg",
        size_bytes=123,
        created_at=now,
    )
    with db.write() as session:
        photo_repo.add(session, photo)

    with db.read() as session:
        stored = photo_repo.get_by_id(session, photo.id)
        assert stored is not None
        assert (stored.id, stored.event_id, stored.uploader_id) == (
            photo.id,
            event.id,
            event.organizer_participant_id,
        )
        assert (
            stored.storage_location,
            stored.content_type,
            stored.size_bytes,
            stored.created_at,
        ) == (
            "photo.jpg",
            "image/jpeg",
            123,
            now,
        )
        assert photo_repo.get_by_id(session, str(uuid4())) is None


def test_photo_repository_rejects_duplicate_storage_location(photo_context):
    (photo_model, photo_repo), db, event = photo_context
    values = {
        "event_id": event.id,
        "uploader_id": event.organizer_participant_id,
        "storage_location": "photo.jpg",
        "content_type": "image/jpeg",
        "size_bytes": 123,
        "created_at": datetime(2026, 10, 30, 12, 0, tzinfo=UTC),
    }
    with db.write() as session:
        photo_repo.add(session, photo_model(id=str(uuid4()), **values))

    with pytest.raises(IntegrityError), db.write() as session:
        photo_repo.add(session, photo_model(id=str(uuid4()), **values))
