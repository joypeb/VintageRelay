import logging
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.core.logging import JsonFormatter, TextFormatter
from app.domain.errors import EventClosedError, NotFoundError, PhotoAlreadyAttachedError
from app.models.clothing import Clothing
from app.models.participant import Participant
from app.models.photo import Photo
from app.repositories import clothing as clothing_repo
from tests.conftest import close_event, count_rows


@pytest.fixture
def service_context(db, settings, registration_context):
    from app.schemas.clothing import ClothingCreate
    from app.services.clothing import ClothingService

    event, participant, token, _, upload = registration_context
    event_id = event["event"]["id"]
    photo = upload(event_id, token)
    now = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
    clothing_id = str(uuid4())
    service = ClothingService(
        db, settings, clock=lambda: now, clothing_id_generator=lambda: clothing_id
    )
    body = ClothingCreate(photo_id=photo["id"], description="  Secret denim jacket  ")
    return service, body, event_id, participant, now, clothing_id


def test_register_clothing_uses_injected_clock_and_id(db, service_context):
    service, body, event_id, participant, now, clothing_id = service_context
    result = service.register(event_id, participant, body)
    assert result.id == clothing_id
    assert result.created_at == result.updated_at == now
    with db.read() as session:
        row = session.get(Clothing, clothing_id)
        assert row is not None
        assert row.event_id == event_id and row.owner_id == participant.id
        assert row.photo_id == body.photo_id
        assert row.description == "Secret denim jacket"
        assert row.created_at == row.updated_at == now
        assert row.status == "available" and row.content_version == 1


def test_register_clothing_maps_photo_uniqueness_race(db, service_context, monkeypatch):
    service, body, event_id, participant, now, _ = service_context
    with db.write() as session:
        session.add(
            Clothing(
                id=str(uuid4()),
                event_id=event_id,
                owner_id=participant.id,
                photo_id=body.photo_id,
                description="Existing",
                status="available",
                content_version=1,
                created_at=now,
                updated_at=now,
            )
        )
    monkeypatch.setattr(clothing_repo, "photo_is_attached", lambda session, photo_id: False)
    with pytest.raises(PhotoAlreadyAttachedError):
        service.register(event_id, participant, body)
    assert count_rows(db, "clothes") == 1


def test_register_clothing_logs_once_after_commit_without_description(db, service_context, caplog):
    service, body, event_id, participant, _, clothing_id = service_context
    visible_counts = []

    class CommitObserver(logging.Handler):
        def emit(self, record):
            if record.name.startswith("app.") and record.getMessage() == "clothing_registered":
                visible_counts.append(count_rows(db, "clothes"))

    observer = CommitObserver()
    root = logging.getLogger()
    root.addHandler(observer)
    caplog.set_level(logging.INFO)
    try:
        service.register(event_id, participant, body)
    finally:
        root.removeHandler(observer)
    records = [record for record in caplog.records if record.name.startswith("app.")]
    registered = [record for record in records if record.getMessage() == "clothing_registered"]
    assert len(registered) == 1
    standard = set(vars(logging.makeLogRecord({}))) | {"message", "asctime"}
    extras = {key: value for key, value in vars(registered[0]).items() if key not in standard}
    assert extras == {
        "clothing_id": clothing_id,
        "event_id": event_id,
        "description_length": len("Secret denim jacket"),
    }
    assert visible_counts == [1]
    for record in records:
        for formatter in (JsonFormatter(), TextFormatter()):
            assert "Secret denim jacket" not in formatter.format(record)


@pytest.mark.parametrize(
    "case", ["missing_event", "closed", "missing_photo", "foreign_photo", "attached"]
)
def test_register_clothing_rejections_do_not_log_success(db, service_context, caplog, case):
    service, body, event_id, participant, now, _ = service_context
    if case == "missing_event":
        event_id = str(uuid4())
    elif case == "closed":
        close_event(db, event_id, now)
    elif case == "missing_photo":
        body.photo_id = str(uuid4())
    elif case == "foreign_photo":
        with db.write() as session:
            photo = session.get(Photo, body.photo_id)
            assert photo is not None
            other = Participant(
                id=str(uuid4()),
                event_id=event_id,
                display_name="Other",
                session_token_hash=str(uuid4()),
                created_at=now,
            )
            session.add(other)
            session.flush()
            photo.uploader_id = other.id
    else:
        with db.write() as session:
            session.add(
                Clothing(
                    id=str(uuid4()),
                    event_id=event_id,
                    owner_id=participant.id,
                    photo_id=body.photo_id,
                    description="Existing",
                    status="available",
                    content_version=1,
                    created_at=now,
                    updated_at=now,
                )
            )
    before = count_rows(db, "clothes")
    caplog.set_level(logging.INFO)
    expected = (
        EventClosedError
        if case == "closed"
        else PhotoAlreadyAttachedError
        if case == "attached"
        else NotFoundError
    )
    with pytest.raises(expected):
        service.register(event_id, participant, body)
    assert count_rows(db, "clothes") == before
    assert not [
        record
        for record in caplog.records
        if record.name.startswith("app.") and record.getMessage() == "clothing_registered"
    ]
