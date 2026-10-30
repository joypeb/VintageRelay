from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import inspect, text

from app.domain.errors import NotFoundError
from tests.conftest import close_event, count_rows


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def state(db):
    with db.read() as session:
        columns = {column["name"] for column in inspect(session.connection()).get_columns("photos")}
        if "clothing_id" in columns:
            rows = session.execute(text("SELECT id, clothing_id FROM photos ORDER BY id")).all()
        else:
            rows = session.execute(
                text(
                    "SELECT p.id, c.id FROM photos p LEFT JOIN clothes c "
                    "ON c.photo_id = p.id ORDER BY p.id"
                )
            ).all()
        return count_rows(db, "clothes"), rows


def assert_rejected(response, db, before, status, code):
    assert state(db) == before
    assert response.status_code == status
    error = response.json()["error"]
    assert error["code"] == code
    if code == "NOT_FOUND":
        assert error["message"] == NotFoundError.message
    return error


@pytest.mark.parametrize(
    ("body", "field", "reason"),
    [
        ({"description": "Jacket"}, "photoIds", "required"),
        ({"photoIds": [], "description": "Jacket"}, "photoIds", "required"),
        (
            {"photoIds": [str(i) for i in range(11)], "description": "Jacket"},
            "photoIds",
            "too_long",
        ),
        ({"photoIds": ["id", "id"], "description": "Jacket"}, "photoIds", "invalid"),
        ({"photoId": "id", "description": "Jacket"}, "photoId", "unknown_field"),
        ({"photoIds": ["id"]}, "description", "required"),
        ({"photoIds": ["id"], "description": ""}, "description", "required"),
        ({"photoIds": ["id"], "description": "   "}, "description", "required"),
        ({"photoIds": ["id"], "description": "x" * 1001}, "description", "too_long"),
        ({"photoIds": ["id"], "description": "Jacket", "extra": True}, "extra", "unknown_field"),
    ],
)
@pytest.mark.parametrize("authenticated", [True, False])
def test_registration_validation_precedes_auth(
    client, db, registration_context, body, field, reason, authenticated
):
    event, _, token, _, _ = registration_context
    before = state(db)
    response = client.post(
        f"/api/v1/events/{event['event']['id']}/clothing",
        headers=auth(token) if authenticated else {},
        json={"category": "top", "title": "Jacket", **body},
    )
    error = assert_rejected(response, db, before, 422, "VALIDATION_ERROR")
    assert {"field": field, "reason": reason} in error["details"]["fields"]
    if field == "photoIds":
        assert error["details"]["fields"] == [{"field": field, "reason": reason}]


@pytest.mark.parametrize(
    ("changes", "missing", "field", "reason"),
    [
        ({}, "category", "category", "required"),
        ({}, "title", "title", "required"),
        ({"category": "shoes"}, None, "category", "invalid"),
        ({"title": "   "}, None, "title", "required"),
        ({"title": "x" * 101}, None, "title", "too_long"),
        ({"title": "Jacket\x00"}, None, "title", "invalid_characters"),
        ({"extra": True}, None, "extra", "unknown_field"),
        (
            {"category": "bottom", "measurements": {"sleeve": 20}},
            None,
            "measurements.sleeve",
            "invalid",
        ),
        ({"measurements": {"waist": 20}}, None, "measurements.waist", "invalid"),
        ({"category": "other", "measurements": {"chest": 20}}, None, "measurements", "invalid"),
        ({"measurements": {"chest": 0}}, None, "measurements.chest", "invalid"),
        ({"measurements": {"chest": -1}}, None, "measurements.chest", "invalid"),
        ({"measurements": {"chest": 121}}, None, "measurements.chest", "invalid"),
        ({"measurements": {"chest": "wide"}}, None, "measurements.chest", "invalid"),
        ({"measurements": {"chest": "21"}}, None, "measurements.chest", "invalid"),
        ({"measurements": {"unknown": 20}}, None, "measurements.unknown", "unknown_field"),
    ],
)
@pytest.mark.parametrize("authenticated", [True, False])
def test_registration_rejects_invalid_category_title_and_measurements(
    client, db, registration_context, changes, missing, field, reason, authenticated
):
    event, _, token, _, _ = registration_context
    body = {"photoIds": ["id"], "category": "top", "title": "Jacket", "description": "Jacket"}
    body.update(changes)
    if missing:
        del body[missing]
    before = state(db)
    response = client.post(
        f"/api/v1/events/{event['event']['id']}/clothing",
        headers=auth(token) if authenticated else {},
        json=body,
    )
    error = assert_rejected(response, db, before, 422, "VALIDATION_ERROR")
    assert {"field": field, "reason": reason} in error["details"]["fields"]


def test_registration_rejects_malformed_json(client, db, registration_context):
    event, _, token, _, _ = registration_context
    before = state(db)
    response = client.post(
        f"/api/v1/events/{event['event']['id']}/clothing",
        headers={**auth(token), "Content-Type": "application/json"},
        content="{",
    )
    assert_rejected(response, db, before, 400, "BAD_REQUEST")


@pytest.mark.parametrize("token", [None, "invalid-token"])
def test_registration_requires_authentication(client, db, registration_context, token):
    event, _, _, _, _ = registration_context
    before = state(db)
    response = client.post(
        f"/api/v1/events/{event['event']['id']}/clothing",
        headers=auth(token) if token else {},
        json={"photoIds": ["id"], "category": "top", "title": "Jacket", "description": "Jacket"},
    )
    assert_rejected(response, db, before, 401, "UNAUTHENTICATED")


def test_registration_hides_inaccessible_events(client, db, registration_context):
    event, _, token, create_event, upload = registration_context
    other = create_event("Other")
    photo = upload(event["event"]["id"], token)
    before = state(db)
    errors = []
    for event_id in (str(uuid4()), "not-a-uuid", other["event"]["id"]):
        response = client.post(
            f"/api/v1/events/{event_id}/clothing",
            headers=auth(token),
            json={
                "photoIds": [photo["id"]],
                "category": "top",
                "title": "Jacket",
                "description": "Jacket",
            },
        )
        error = assert_rejected(response, db, before, 404, "NOT_FOUND").copy()
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
    before = state(db)
    response = client.post(
        f"/api/v1/events/{event_id}/clothing",
        headers=auth(token),
        json={
            "photoIds": [str(uuid4()) if unknown_photo else photo["id"]],
            "category": "top",
            "title": "Jacket",
            "description": "Jacket",
        },
    )
    assert_rejected(response, db, before, 409, "EVENT_CLOSED")


def test_registration_hides_inaccessible_photos(client, db, registration_context):
    event, _, token, create_event, upload = registration_context
    event_id = event["event"]["id"]
    other = create_event("Other")
    other_photo = upload(other["event"]["id"], other["participantToken"])
    same_event_photo = upload(event_id, event["participantToken"])
    valid = upload(event_id, token)
    before = state(db)
    errors = []
    for photo_id in (str(uuid4()), "not-a-uuid", other_photo["id"], same_event_photo["id"]):
        response = client.post(
            f"/api/v1/events/{event_id}/clothing",
            headers=auth(token),
            json={
                "photoIds": [valid["id"], photo_id],
                "category": "top",
                "title": "Jacket",
                "description": "Jacket",
            },
        )
        error = assert_rejected(response, db, before, 404, "NOT_FOUND").copy()
        error.pop("requestId")
        errors.append(error)
    assert all(error == errors[0] for error in errors)


def test_registration_rejects_photo_already_attached(client, db, registration_context):
    event, _, token, _, upload = registration_context
    event_id = event["event"]["id"]
    attached, first, last = [upload(event_id, token) for _ in range(3)]
    path = f"/api/v1/events/{event_id}/clothing"
    response = client.post(
        path,
        headers=auth(token),
        json={
            "photoIds": [attached["id"]],
            "category": "top",
            "title": "Existing",
            "description": "Existing",
        },
    )
    assert response.status_code == 201
    before = state(db)
    response = client.post(
        path,
        headers=auth(token),
        json={
            "photoIds": [first["id"], attached["id"], last["id"]],
            "category": "top",
            "title": "Jacket",
            "description": "Jacket",
        },
    )
    assert_rejected(response, db, before, 409, "PHOTO_ALREADY_ATTACHED")
