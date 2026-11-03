import logging
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import update

from app.core.logging import JsonFormatter, TextFormatter
from app.domain.errors import NotFoundError
from app.models.clothing import Clothing
from tests.conftest import close_event


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def delete_clothing(client, clothing_id, token):
    return client.delete(
        f"/api/v1/clothing/{clothing_id}",
        headers=auth(token) if token else {},
    )


def get_clothing(client, clothing_id, token):
    return client.get(
        f"/api/v1/clothing/{clothing_id}",
        headers=auth(token) if token else {},
    )


def assert_error(response, status, code):
    assert response.status_code == status
    error = response.json()["error"]
    assert set(error) == {"code", "message", "details", "requestId"}
    assert error["code"] == code
    assert error["requestId"] == response.headers["X-Request-ID"]
    return error


def set_status(db, clothing_id, status):
    with db.write() as session:
        session.execute(update(Clothing).where(Clothing.id == clothing_id).values(status=status))


@pytest.fixture
def withdraw_context(client, registration_context):
    event, participant, token, create_event, upload = registration_context
    event_id = event["event"]["id"]
    photos = [upload(event_id, token) for _ in range(2)]
    response = client.post(
        f"/api/v1/events/{event_id}/clothing",
        headers=auth(token),
        json={
            "photoIds": [photo["id"] for photo in photos],
            "category": "top",
            "title": "Green denim jacket",
            "description": "Cropped green jacket, size M.",
            "measurements": {"chest": 21.0, "shoulder": 18.5},
        },
    )
    assert response.status_code == 201
    return {
        "event": event,
        "participant": participant,
        "token": token,
        "create_event": create_event,
        "upload": upload,
        "clothing": response.json(),
        "photos": photos,
    }


def test_withdraw_available_returns_204_and_marks_withdrawn(client, withdraw_context):
    clothing_id = withdraw_context["clothing"]["id"]
    token = withdraw_context["token"]

    response = delete_clothing(client, clothing_id, token)

    assert response.status_code == 204
    assert response.content == b""
    assert "X-Request-ID" in response.headers
    current = get_clothing(client, clothing_id, token).json()
    assert current["status"] == "withdrawn"


def test_withdraw_replay_returns_204_without_changes(client, withdraw_context):
    clothing_id = withdraw_context["clothing"]["id"]
    token = withdraw_context["token"]

    first = delete_clothing(client, clothing_id, token)
    assert first.status_code == 204
    before = get_clothing(client, clothing_id, token).json()

    second = delete_clothing(client, clothing_id, token)

    assert second.status_code == 204
    assert second.content == b""
    assert get_clothing(client, clothing_id, token).json() == before


def test_withdraw_replay_after_close_returns_204(client, db, withdraw_context):
    clothing_id = withdraw_context["clothing"]["id"]
    token = withdraw_context["token"]

    assert delete_clothing(client, clothing_id, token).status_code == 204
    close_event(db, withdraw_context["event"]["event"]["id"], datetime.now(UTC))

    response = delete_clothing(client, clothing_id, token)

    assert response.status_code == 204
    assert response.content == b""


def test_withdraw_by_same_event_non_owner_is_forbidden(client, withdraw_context):
    clothing_id = withdraw_context["clothing"]["id"]
    token = withdraw_context["token"]
    organizer_token = withdraw_context["event"]["participantToken"]
    before = get_clothing(client, clothing_id, token).json()

    response = delete_clothing(client, clothing_id, organizer_token)

    assert_error(response, 403, "FORBIDDEN")
    assert get_clothing(client, clothing_id, token).json() == before


def test_withdraw_hides_cross_event_garment_and_token(client, withdraw_context):
    clothing_id = withdraw_context["clothing"]["id"]
    token = withdraw_context["token"]
    create_event = withdraw_context["create_event"]

    foreign = create_event("Foreign")
    foreign_token = foreign["participantToken"]
    foreign_photo = withdraw_context["upload"](foreign["event"]["id"], foreign_token)
    foreign_garment = client.post(
        f"/api/v1/events/{foreign['event']['id']}/clothing",
        headers=auth(foreign_token),
        json={
            "photoIds": [foreign_photo["id"]],
            "category": "top",
            "title": "Foreign jacket",
            "description": "Foreign jacket.",
        },
    )
    assert foreign_garment.status_code == 201

    errors = []
    for target_id, viewer in (
        (foreign_garment.json()["id"], token),
        (clothing_id, foreign_token),
    ):
        response = delete_clothing(client, target_id, viewer)

        error = assert_error(response, 404, "NOT_FOUND").copy()
        assert error["message"] == NotFoundError.message
        error.pop("requestId")
        errors.append(error)

    assert all(error == errors[0] for error in errors)


def test_withdraw_missing_garment_returns_not_found(client, withdraw_context):
    token = withdraw_context["token"]

    response = delete_clothing(client, str(uuid4()), token)

    error = assert_error(response, 404, "NOT_FOUND")
    assert error["message"] == NotFoundError.message


@pytest.mark.parametrize("token", [None, "invalid-token"])
def test_withdraw_requires_authentication(client, withdraw_context, token):
    response = delete_clothing(client, withdraw_context["clothing"]["id"], token)

    assert_error(response, 401, "UNAUTHENTICATED")


def test_withdraw_confirmed_garment_conflicts_with_guidance(client, db, withdraw_context):
    clothing_id = withdraw_context["clothing"]["id"]
    token = withdraw_context["token"]
    set_status(db, clothing_id, "confirmed")

    response = delete_clothing(client, clothing_id, token)

    error = assert_error(response, 409, "CLOTHING_ALREADY_CONFIRMED")
    assert error["message"] == "Cancel the confirmed exchange before withdrawing this garment."


def test_withdraw_closed_event_rejects_available_garment(client, db, withdraw_context):
    clothing_id = withdraw_context["clothing"]["id"]
    token = withdraw_context["token"]
    close_event(db, withdraw_context["event"]["event"]["id"], datetime.now(UTC))

    response = delete_clothing(client, clothing_id, token)

    assert_error(response, 409, "EVENT_CLOSED")


def test_withdraw_logs_withdrawn_counts(client, caplog, withdraw_context):
    caplog.set_level(logging.INFO)
    clothing_id = withdraw_context["clothing"]["id"]
    token = withdraw_context["token"]

    response = delete_clothing(client, clothing_id, token)

    assert response.status_code == 204
    records = [record for record in caplog.records if record.getMessage() == "clothing_withdrawn"]
    assert len(records) == 1
    record = records[0]
    assert record.clothing_id == clothing_id
    assert record.invalidated_intent_count == 0
    assert record.invalidated_proposal_count == 0
    for formatter in (JsonFormatter(), TextFormatter()):
        formatted = formatter.format(record)
        assert clothing_id in formatted
