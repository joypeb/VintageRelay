from datetime import UTC, datetime
from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image

from tests.conftest import close_event, count_rows


@pytest.fixture
def events(client):
    def create(name):
        response = client.post(
            "/api/v1/events", json={"name": name, "organizerDisplayName": "Mina"}
        )
        assert response.status_code == 201
        return response.json()

    return create("Event A"), create("Event B")


@pytest.fixture
def upload(client, db, tmp_path):
    photo_dir = tmp_path / "photos"
    photo_dir.mkdir()
    client.app.state.settings.photo_dir = str(photo_dir)

    def post(event_id, **kwargs):
        before = count_rows(db, "photos"), sorted(photo_dir.iterdir())
        response = client.post(f"/api/v1/events/{event_id}/photos", **kwargs)
        assert (count_rows(db, "photos"), sorted(photo_dir.iterdir())) == before
        return response

    return post


@pytest.fixture
def jpeg():
    image = BytesIO()
    Image.new("RGB", (1, 1), "red").save(image, format="JPEG")
    return image.getvalue()


def auth(event):
    return {"Authorization": f"Bearer {event['participantToken']}"}


def assert_error(response, status, code):
    assert response.status_code == status
    error = response.json()["error"]
    assert error["code"] == code
    assert error["requestId"] == response.headers["X-Request-ID"]
    return error


@pytest.mark.parametrize("files", [{"other": ("x.txt", b"x")}, {"file": ("x.jpg", b"")}])
def test_missing_or_empty_file_returns_validation_error(upload, events, files):
    event, _ = events
    response = upload(event["event"]["id"], headers=auth(event), files=files)
    assert_error(response, 422, "VALIDATION_ERROR")


def test_non_multipart_body_returns_bad_request(upload, events):
    event, _ = events
    response = upload(event["event"]["id"], headers=auth(event), content=b"garbage")
    assert_error(response, 400, "BAD_REQUEST")


def test_oversized_file_with_understated_content_length_returns_413(upload, events):
    event, _ = events
    headers = {**auth(event), "Content-Length": "1"}
    response = upload(
        event["event"]["id"],
        headers=headers,
        files={"file": ("large.jpg", b"x" * (10 * 1024 * 1024 + 1), "image/jpeg")},
    )
    error = assert_error(response, 413, "FILE_TOO_LARGE")
    assert error["details"] == {"maxBytes": 10485760}


@pytest.mark.parametrize(
    ("filename", "content"),
    [
        ("renamed.jpg", b"not an image"),
        ("photo.heic", b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00heicmif1"),
    ],
)
def test_unsupported_bytes_return_415(upload, events, filename, content):
    event, _ = events
    response = upload(
        event["event"]["id"], headers=auth(event), files={"file": (filename, content, "image/jpeg")}
    )
    error = assert_error(response, 415, "UNSUPPORTED_MEDIA_TYPE")
    assert error["details"] == {"allowedTypes": ["image/jpeg", "image/png", "image/webp"]}


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer invalid-token"}])
def test_missing_or_invalid_token_returns_401(upload, events, jpeg, headers):
    event, _ = events
    response = upload(event["event"]["id"], headers=headers, files={"file": ("x.jpg", jpeg)})
    assert_error(response, 401, "UNAUTHENTICATED")


def test_inaccessible_events_return_identical_404s(upload, events, jpeg):
    event, other = events
    errors = []
    for event_id in (str(uuid4()), "not-a-uuid", other["event"]["id"]):
        response = upload(event_id, headers=auth(event), files={"file": ("x.jpg", jpeg)})
        error = assert_error(response, 404, "NOT_FOUND").copy()
        del error["requestId"]
        errors.append(error)
    assert errors[0] == errors[1] == errors[2]


def test_closed_event_checks_scope_before_closure(upload, events, db, jpeg):
    event, other = events
    event_id = event["event"]["id"]
    close_event(db, event_id, datetime(2026, 10, 29, tzinfo=UTC))

    foreign = upload(event_id, headers=auth(other), files={"file": ("x.jpg", jpeg)})
    missing = upload(str(uuid4()), headers=auth(other), files={"file": ("x.jpg", jpeg)})
    foreign_error = assert_error(foreign, 404, "NOT_FOUND").copy()
    missing_error = assert_error(missing, 404, "NOT_FOUND").copy()
    del foreign_error["requestId"], missing_error["requestId"]
    assert foreign_error == missing_error

    response = upload(event_id, headers=auth(event), files={"file": ("x.jpg", jpeg)})
    assert_error(response, 409, "EVENT_CLOSED")


def test_decompression_bomb_rejected(upload, events):
    content = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000186a0000186a0080200000027309c9f"
        "0000000949444154789c630000000100015eff7df90000000049454e44ae426082"
    )
    with pytest.raises(Image.DecompressionBombError):
        Image.open(BytesIO(content)).load()

    event, _ = events
    response = upload(
        event["event"]["id"],
        headers=auth(event),
        files={"file": ("bomb.png", content, "image/png")},
    )
    assert_error(response, 415, "UNSUPPORTED_MEDIA_TYPE")
