from datetime import datetime
from io import BytesIO
from pathlib import Path
from uuid import UUID

import pytest
from PIL import Image, TiffImagePlugin

from app.models.photo import Photo
from tests.conftest import add_participant


def image_bytes(image_format, exif=None):
    buffer = BytesIO()
    Image.new("RGB", (2, 3), "red").save(buffer, format=image_format, exif=exif or b"")
    return buffer.getvalue()


@pytest.fixture
def upload_context(client, db, tmp_path):
    client.app.state.settings.photo_dir = str(tmp_path / "photos")
    created = client.post("/api/v1/events", json={"name": "Swap", "organizerDisplayName": "Mina"})
    assert created.status_code == 201
    event_id = created.json()["event"]["id"]
    participant, token = add_participant(db, event_id, "Joon")
    return event_id, participant.id, token


def upload(client, context, raw, content_type="image/jpeg"):
    event_id, _, token = context
    return client.post(
        f"/api/v1/events/{event_id}/photos",
        files={"file": ("misleading.client-name", raw, content_type)},
        headers={"Authorization": f"Bearer {token}"},
    )


@pytest.mark.parametrize(
    ("image_format", "content_type", "extension"),
    [("JPEG", "image/jpeg", "jpg"), ("PNG", "image/png", "png"), ("WEBP", "image/webp", "webp")],
)
def test_upload_returns_photo_and_public_stored_bytes(
    client, db, settings, upload_context, image_format, content_type, extension
):
    response = upload(client, upload_context, image_bytes(image_format), content_type)

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "url", "contentType", "sizeBytes", "createdAt"}
    photo_id = UUID(body["id"])
    assert photo_id.version == 4
    assert body["url"] == f"{settings.app_base_url}/api/v1/photos/{photo_id}"
    assert body["contentType"] == content_type
    assert datetime.fromisoformat(body["createdAt"]).utcoffset().total_seconds() == 0
    assert body["createdAt"].endswith("Z")

    with db.read() as session:
        photo = session.get(Photo, str(photo_id))
        assert photo is not None
        assert photo.event_id == upload_context[0]
        assert photo.uploader_id == upload_context[1]
        assert photo.storage_location == f"{photo_id}.{extension}"
        assert photo.content_type == content_type
        stored_bytes = (Path(settings.photo_dir) / photo.storage_location).read_bytes()
        assert photo.size_bytes == body["sizeBytes"] == len(stored_bytes)

    viewed = client.get(body["url"])
    assert viewed.status_code == 200
    assert viewed.headers["content-type"] == content_type
    assert viewed.content == stored_bytes


def test_upload_normalizes_orientation_and_removes_exif(client, upload_context):
    exif = Image.Exif()
    exif[274] = 6
    exif[34853] = {
        1: "N",
        2: tuple(TiffImagePlugin.IFDRational(value) for value in (37, 30, 0)),
    }
    raw = image_bytes("JPEG", exif)
    with Image.open(BytesIO(raw)) as original:
        assert original.getexif()[274] == 6
        assert original.getexif().get_ifd(34853)

    response = upload(client, upload_context, raw)

    assert response.status_code == 201
    viewed = client.get(response.json()["url"])
    assert viewed.status_code == 200
    with Image.open(BytesIO(viewed.content)) as stored:
        assert stored.size == (3, 2)
        assert len(stored.getexif()) == 0


def test_identical_uploads_create_distinct_photos(client, upload_context):
    raw = image_bytes("JPEG")
    first = upload(client, upload_context, raw)
    second = upload(client, upload_context, raw)

    assert first.status_code == second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


def test_upload_accepts_exactly_ten_mib(client, upload_context):
    raw = image_bytes("JPEG")
    raw += b"\0" * (10485760 - len(raw))
    assert len(raw) == 10485760

    response = upload(client, upload_context, raw)

    assert response.status_code == 201
