from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.domain.errors import NotFoundError
from tests.conftest import close_event, count_rows


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def assert_rejected(response, db, before, status, code):
    assert count_rows(db, "clothes") == before
    assert response.status_code == status
    error = response.json()["error"]
    assert error["code"] == code
    if code == "NOT_FOUND":
        assert error["message"] == NotFoundError.message
    return error


@pytest.mark.parametrize(
    ("body", "field", "reason"),
    [
        ({"description": "Jacket"}, "photoId", "required"),
        ({"photoId": "id"}, "description", "required"),
        ({"photoId": "id", "description": ""}, "description", "required"),
        ({"photoId": "id", "description": "   "}, "description", "required"),
        ({"photoId": "id", "description": "x" * 1001}, "description", "too_long"),
        ({"photoId": "id", "description": "Jacket", "extra": True}, "extra", "unknown_field"),
    ],
)
@pytest.mark.parametrize("authenticated", [True, False])
def test_registration_validation_precedes_auth(
    client, db, registration_context, body, field, reason, authenticated
):
    event, _, token, _, _ = registration_context
    response = client.post(
        f"/api/v1/events/{event['event']['id']}/clothing",
        headers=auth(token) if authenticated else {},
        json=body,
    )
    error = assert_rejected(response, db, 0, 422, "VALIDATION_ERROR")
    assert {"field": field, "reason": reason} in error["details"]["fields"]


def test_registration_rejects_malformed_json(client, db, registration_context):
    event, _, token, _, _ = registration_context
    response = client.post(
        f"/api/v1/events/{event['event']['id']}/clothing",
        headers={**auth(token), "Content-Type": "application/json"},
        content="{",
    )
    assert_rejected(response, db, 0, 400, "BAD_REQUEST")


@pytest.mark.parametrize("token", [None, "invalid-token"])
def test_registration_requires_authentication(client, db, registration_context, token):
    event, _, _, _, _ = registration_context
    response = client.post(
        f"/api/v1/events/{event['event']['id']}/clothing",
        headers=auth(token) if token else {},
        json={"photoId": "id", "description": "Jacket"},
    )
    assert_rejected(response, db, 0, 401, "UNAUTHENTICATED")


def test_registration_hides_inaccessible_events(client, db, registration_context):
    event, _, token, create_event, upload = registration_context
    other = create_event("Other")
    photo = upload(event["event"]["id"], token)
    errors = []
    for event_id in (str(uuid4()), "not-a-uuid", other["event"]["id"]):
        response = client.post(
            f"/api/v1/events/{event_id}/clothing",
            headers=auth(token),
            json={"photoId": photo["id"], "description": "Jacket"},
        )
        error = assert_rejected(response, db, 0, 404, "NOT_FOUND").copy()
        error.pop("requestId")
        errors.append(error)
    assert errors[0] == errors[1] == errors[2]


@pytest.mark.parametrize("unknown_photo", [False, True])
def test_registration_rejects_closed_event_before_photo_lookup(
    client, db, registration_context, unknown_photo
):
    event, _, token, _, upload = registration_context
    event_id = event["event"]["id"]
    photo = upload(event_id, token)
    close_event(db, event_id, datetime.now(UTC))
    response = client.post(
        f"/api/v1/events/{event_id}/clothing",
        headers=auth(token),
        json={"photoId": str(uuid4()) if unknown_photo else photo["id"], "description": "Jacket"},
    )
    assert_rejected(response, db, 0, 409, "EVENT_CLOSED")


def test_registration_hides_inaccessible_photos(client, db, registration_context):
    event, _, token, create_event, upload = registration_context
    event_id = event["event"]["id"]
    other = create_event("Other")
    other_photo = upload(other["event"]["id"], other["participantToken"])
    same_event_photo = upload(event_id, event["participantToken"])
    errors = []
    for photo_id in (str(uuid4()), "not-a-uuid", other_photo["id"], same_event_photo["id"]):
        response = client.post(
            f"/api/v1/events/{event_id}/clothing",
            headers=auth(token),
            json={"photoId": photo_id, "description": "Jacket"},
        )
        error = assert_rejected(response, db, 0, 404, "NOT_FOUND").copy()
        error.pop("requestId")
        errors.append(error)
    assert all(error == errors[0] for error in errors)


def test_registration_rejects_photo_already_attached(client, db, registration_context):
    event, _, token, _, upload = registration_context
    event_id = event["event"]["id"]
    photo = upload(event_id, token)
    path = f"/api/v1/events/{event_id}/clothing"
    body = {"photoId": photo["id"], "description": "Jacket"}
    response = client.post(path, headers=auth(token), json=body)
    assert response.status_code == 201
    assert count_rows(db, "clothes") == 1
    for description in ("Jacket", "Different"):
        response = client.post(path, headers=auth(token), json={**body, "description": description})
        assert_rejected(response, db, 1, 409, "PHOTO_ALREADY_ATTACHED")
