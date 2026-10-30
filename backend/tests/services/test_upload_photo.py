import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from threading import Event, local

import pytest
from PIL import Image
from starlette.datastructures import UploadFile

from app.core.logging import JsonFormatter, TextFormatter
from app.domain.errors import EventClosedError
from app.models.participant import Participant
from app.repositories import event as event_repo
from app.repositories import photo as photo_repo
from app.schemas.event import EventCreate
from app.services.event import EventService
from app.services.photo import PhotoService
from tests.conftest import count_rows

PHOTO_ID = "12345678-1234-4234-8234-123456789abc"
FIXED_TIME = datetime(2026, 10, 30, tzinfo=UTC)
TOKEN = "participant-secret-token"


def setup_upload(db, settings, tmp_path):
    settings.photo_dir = str(tmp_path / "photos")
    created = EventService(db, settings, token_generator=lambda: TOKEN).create(
        EventCreate(name="Swap", organizer_display_name="Mina")
    )
    with db.read() as session:
        actor = session.get(Participant, created.event.organizer_participant_id)
    assert actor is not None
    service = PhotoService(
        db, settings, clock=lambda: FIXED_TIME, photo_id_generator=lambda: PHOTO_ID
    )
    return created.event, actor, service


def image_upload():
    buffer = BytesIO()
    Image.new("RGB", (2, 3), "red").save(buffer, format="PNG")
    raw = buffer.getvalue()
    return UploadFile(file=BytesIO(raw), filename="private.png"), raw


def app_records(caplog):
    return [record for record in caplog.records if record.name.startswith("app.")]


def uploaded_records(caplog):
    return [record for record in app_records(caplog) if record.getMessage() == "photo_uploaded"]


def test_upload_returns_photo_and_logs_only_safe_fields(db, settings, tmp_path, caplog):
    event, actor, service = setup_upload(db, settings, tmp_path)
    upload, raw = image_upload()
    caplog.clear()
    caplog.set_level(logging.INFO)

    result = service.upload(event.id, actor, upload)

    path = Path(settings.photo_dir) / f"{PHOTO_ID}.png"
    assert result.id == PHOTO_ID
    assert result.url == f"{settings.app_base_url}/api/v1/photos/{PHOTO_ID}"
    assert result.content_type == "image/png"
    assert result.size_bytes == len(path.read_bytes())
    assert result.created_at == FIXED_TIME
    with db.read() as session:
        photo = photo_repo.get_by_id(session, PHOTO_ID)
        assert photo is not None
        assert (photo.event_id, photo.uploader_id, photo.storage_location) == (
            event.id,
            actor.id,
            path.name,
        )
        assert (photo.content_type, photo.size_bytes, photo.created_at) == (
            result.content_type,
            result.size_bytes,
            FIXED_TIME,
        )
    assert count_rows(db, "photos") == 1
    records = uploaded_records(caplog)
    assert len(records) == 1
    reserved = set(vars(logging.makeLogRecord({}))) | {"message", "asctime"}
    extras = {key: value for key, value in vars(records[0]).items() if key not in reserved}
    assert extras == {
        "event_id": event.id,
        "participant_id": actor.id,
        "photo_id": PHOTO_ID,
        "size_bytes": result.size_bytes,
        "content_type": "image/png",
    }
    for record in app_records(caplog):
        for formatter in (JsonFormatter(), TextFormatter()):
            formatted = formatter.format(record)
            assert repr(raw) not in formatted
            assert TOKEN not in formatted


def test_upload_insert_failure_removes_file_and_rolls_back(
    db, settings, tmp_path, monkeypatch, caplog
):
    event, actor, service = setup_upload(db, settings, tmp_path)
    upload, _ = image_upload()
    original_add = photo_repo.add
    caplog.clear()
    caplog.set_level(logging.INFO)

    def add_then_fail(session, photo):
        assert (Path(settings.photo_dir) / photo.storage_location).is_file()
        original_add(session, photo)
        raise RuntimeError("injected failure")

    monkeypatch.setattr(photo_repo, "add", add_then_fail)
    with pytest.raises(RuntimeError, match="injected failure"):
        service.upload(event.id, actor, upload)

    assert count_rows(db, "photos") == 0
    assert not list(Path(settings.photo_dir).glob("*"))
    assert not uploaded_records(caplog)


def test_upload_storage_failure_leaves_no_row_or_success_log(
    db, settings, tmp_path, monkeypatch, caplog
):
    event, actor, service = setup_upload(db, settings, tmp_path)
    upload, _ = image_upload()
    original_open = Path.open
    caplog.clear()
    caplog.set_level(logging.INFO)

    def fail_write(path, mode="r", *args, **kwargs):
        if any(flag in mode for flag in "wax"):
            raise OSError("injected storage failure")
        return original_open(path, mode, *args, **kwargs)

    monkeypatch.setattr(Path, "open", fail_write)
    with pytest.raises(OSError, match="injected storage failure"):
        service.upload(event.id, actor, upload)

    assert count_rows(db, "photos") == 0
    assert not uploaded_records(caplog)


@pytest.mark.parametrize("first", ["upload", "close"])
def test_upload_and_close_are_serialized_in_controlled_order(
    db, settings, tmp_path, monkeypatch, first
):
    event, actor, _ = setup_upload(db, settings, tmp_path)
    inside, release, second_started = Event(), Event(), Event()
    thread_state = local()
    original_write = db.write
    original_add = photo_repo.add
    original_close = event_repo.mark_closed

    @contextmanager
    def observed_write():
        if getattr(thread_state, "second", False):
            second_started.set()
        with original_write() as session:
            yield session

    def hold_add(session, photo):
        result = original_add(session, photo)
        inside.set()
        assert release.wait(timeout=4)
        return result

    def hold_close(session, event_id, closed_at):
        result = original_close(session, event_id, closed_at)
        inside.set()
        assert release.wait(timeout=4)
        return result

    monkeypatch.setattr(db, "write", observed_write)
    if first == "upload":
        monkeypatch.setattr(photo_repo, "add", hold_add)
    else:
        monkeypatch.setattr(event_repo, "mark_closed", hold_close)

    def run(action, second=False):
        thread_state.second = second
        if action == "upload":
            upload, _ = image_upload()
            return PhotoService(
                db, settings, clock=lambda: FIXED_TIME, photo_id_generator=lambda: PHOTO_ID
            ).upload(event.id, actor, upload)
        return EventService(db, settings, clock=lambda: FIXED_TIME).close(actor, event.id)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first_future = pool.submit(run, first)
        try:
            assert inside.wait(timeout=3), "first operation did not reach its write"
            second_future = pool.submit(run, "close" if first == "upload" else "upload", True)
            assert second_started.wait(timeout=3), "second operation did not attempt its write"
        finally:
            release.set()
        first_result = first_future.result(timeout=5)
        if first == "upload":
            assert first_result.id == PHOTO_ID
            assert second_future.result(timeout=5).status == "closed"
            assert count_rows(db, "photos") == 1
        else:
            assert first_result.status == "closed"
            with pytest.raises(EventClosedError):
                second_future.result(timeout=5)
            assert count_rows(db, "photos") == 0
