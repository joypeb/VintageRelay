from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.models.photo import Photo
from app.repositories import photo as photo_repo
from app.schemas.event import EventCreate
from app.services.event import EventService


@pytest.fixture
def clothing_types():
    from app.models.clothing import Clothing
    from app.repositories import clothing as clothing_repo

    return Clothing, clothing_repo


@pytest.fixture
def clothing_context(clothing_types, db, settings):
    service = EventService(db, settings)
    events = [
        service.create(EventCreate(name=name, organizer_display_name="Mina")).event
        for name in ("First", "Second")
    ]
    return clothing_types, db, events


def add_clothing(session, clothing_model, clothing_repo, event, status):
    now = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
    photo_id = str(uuid4())
    session.add(
        Photo(
            id=photo_id,
            event_id=event.id,
            uploader_id=event.organizer_participant_id,
            storage_location=f"{photo_id}.jpg",
            content_type="image/jpeg",
            size_bytes=123,
            created_at=now,
        )
    )
    session.flush()
    clothing = clothing_model(
        id=str(uuid4()),
        event_id=event.id,
        owner_id=event.organizer_participant_id,
        title="Jacket",
        category="outer",
        description="Jacket",
        status=status,
        content_version=1,
        created_at=now,
        updated_at=now,
    )
    clothing_repo.add(session, clothing)
    assert photo_repo.attach(session, photo_id, clothing.id, 0) is True
    return clothing


def test_clothing_repository_add_and_get_in_event(clothing_context):
    (clothing_model, clothing_repo), db, (event, other) = clothing_context
    with db.write() as session:
        clothing = add_clothing(session, clothing_model, clothing_repo, event, "available")
    with db.read() as session:
        stored = clothing_repo.get_in_event(session, clothing.id, event.id)
        assert stored is not None
        assert (stored.id, stored.event_id, stored.owner_id) == (
            clothing.id,
            event.id,
            event.organizer_participant_id,
        )
        assert (stored.description, stored.status, stored.content_version) == (
            "Jacket",
            "available",
            1,
        )
        assert (stored.created_at, stored.updated_at) == (clothing.created_at, clothing.updated_at)
        assert clothing_repo.get_in_event(session, clothing.id, other.id) is None
        assert clothing_repo.get_in_event(session, str(uuid4()), event.id) is None


def test_photo_repository_attaches_once_and_returns_photos_in_position_order(clothing_context):
    (clothing_model, clothing_repo), db, (event, _) = clothing_context
    with db.write() as session:
        clothing = add_clothing(session, clothing_model, clothing_repo, event, "available")
        first = photo_repo.photos_for(session, [clothing.id])[clothing.id][0]
        second = Photo(
            id=str(uuid4()),
            event_id=event.id,
            uploader_id=event.organizer_participant_id,
            storage_location=f"{uuid4()}.jpg",
            content_type="image/jpeg",
            size_bytes=123,
            created_at=first.created_at,
        )
        session.add(second)
        session.flush()
        assert photo_repo.attach(session, second.id, clothing.id, 1) is True
        assert photo_repo.attach(session, second.id, clothing.id, 2) is False
        photos = photo_repo.photos_for(session, [clothing.id])
        assert [photo.id for photo in photos[clothing.id]] == [first.id, second.id]


def test_clothing_repository_count_available_is_event_scoped(clothing_context):
    (clothing_model, clothing_repo), db, (event, other) = clothing_context
    with db.write() as session:
        for status in ("available", "available", "confirmed", "withdrawn"):
            add_clothing(session, clothing_model, clothing_repo, event, status)
        add_clothing(session, clothing_model, clothing_repo, other, "available")
    with db.read() as session:
        assert clothing_repo.count_available(session, event.id) == 2
        assert clothing_repo.count_available(session, other.id) == 1
        assert clothing_repo.count_available(session, str(uuid4())) == 0
