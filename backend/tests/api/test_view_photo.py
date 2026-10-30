from datetime import UTC, datetime
from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image

from app.models.photo import Photo
from app.repositories import photo as photo_repo


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer garbage"}])
def test_public_photo_returns_stored_bytes(client, db, tmp_path, headers):
    created = client.post(
        "/api/v1/events",
        json={"name": "Swap Corner", "organizerDisplayName": "Mina"},
    )
    assert created.status_code == 201
    event = created.json()["event"]
    client.app.state.settings.photo_dir = str(tmp_path)
    photo_id = str(uuid4())
    storage_location = f"{photo_id}.jpg"
    image = BytesIO()
    Image.new("RGB", (1, 1), "red").save(image, format="JPEG")
    photo_bytes = image.getvalue()
    (tmp_path / storage_location).write_bytes(photo_bytes)
    photo = Photo(
        id=photo_id,
        event_id=event["id"],
        uploader_id=event["organizerParticipantId"],
        storage_location=storage_location,
        content_type="image/jpeg",
        size_bytes=len(photo_bytes),
        created_at=datetime.now(UTC),
    )
    with db.write() as session:
        photo_repo.add(session, photo)
    with db.read() as session:
        stored = photo_repo.get_by_id(session, photo_id)
        assert stored is not None
        assert (tmp_path / stored.storage_location).read_bytes() == photo_bytes

    response = client.get(f"/api/v1/photos/{photo_id}", headers=headers)

    assert response.status_code == 200
    assert response.content == photo_bytes
    assert response.headers["content-type"] == "image/jpeg"


def test_unknown_photo_returns_not_found(client):
    response = client.get(f"/api/v1/photos/{uuid4()}")

    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "NOT_FOUND"
    assert error["message"] == "Resource not found."
    assert response.headers["X-Request-ID"]
    assert error["requestId"] == response.headers["X-Request-ID"]


@pytest.mark.parametrize("photo_id", ["not-a-uuid", "abc!!!"])
def test_malformed_photo_id_returns_not_found(client, photo_id):
    response = client.get(f"/api/v1/photos/{photo_id}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
    assert response.headers["X-Request-ID"]
