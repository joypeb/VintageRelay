import logging
from datetime import UTC, datetime

import pytest

from app.core.logging import JsonFormatter, TextFormatter
from tests.conftest import add_participant, close_event, count_rows


@pytest.fixture
def event(client):
    response = client.post("/api/v1/events", json={"name": "Swap", "organizerDisplayName": "Mina"})
    assert response.status_code == 201
    return response.json()["event"]


def join(client, event_id, code, name="Joon"):
    return client.post(
        f"/api/v1/events/{event_id}/participants", json={"entryCode": code, "displayName": name}
    )


@pytest.mark.parametrize("name", [" Joon ", "A", "A" * 30])
def test_join_returns_session_and_scoped_token(client, event, name):
    response = join(client, event["id"], event["entryCode"].lower(), name)
    assert response.status_code == 201
    body = response.json()
    assert body["participantToken"]
    assert body["event"]["status"] == "active"
    assert body["event"]["stats"] is None
    assert body["event"]["me"]["displayName"] == name.strip()
    assert body["event"]["me"]["isOrganizer"] is False
    headers = {"Authorization": f"Bearer {body['participantToken']}"}
    read = client.get(f"/api/v1/events/{event['id']}", headers=headers)
    assert read.status_code == 200
    assert read.json()["me"] == body["event"]["me"]
    assert "participantToken" not in read.json()
    other = client.post(
        "/api/v1/events", json={"name": "Other", "organizerDisplayName": "Alex"}
    ).json()["event"]
    assert client.get(f"/api/v1/events/{other['id']}", headers=headers).status_code == 404


def test_join_ignores_invalid_bearer_token(client, event):
    response = client.post(
        f"/api/v1/events/{event['id']}/participants",
        json={"entryCode": event["entryCode"], "displayName": "Joon"},
        headers={"Authorization": "Bearer garbage"},
    )
    assert response.status_code == 201


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"displayName": "Joon"}, "entryCode"),
        ({"entryCode": "X"}, "displayName"),
        ({"entryCode": "X", "displayName": "  "}, "displayName"),
        ({"entryCode": "X", "displayName": "A" * 31}, "displayName"),
        ({"entryCode": "X", "displayName": "A\u0001B"}, "displayName"),
        ({"entryCode": "X", "displayName": "Joon", "extra": "x"}, "extra"),
    ],
)
def test_invalid_join_rejected_without_participant(client, db, event, payload, field):
    before = count_rows(db, "participants")
    response = client.post(f"/api/v1/events/{event['id']}/participants", json=payload)
    assert count_rows(db, "participants") == before
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert field in [item["field"] for item in error["details"]["fields"]]
    assert error["requestId"] == response.headers["X-Request-ID"]


def test_unknown_event_and_wrong_code_have_identical_errors(client, db, event):
    before = count_rows(db, "participants")
    responses = [
        join(client, event["id"], "WRONG"),
        join(client, "00000000-0000-4000-8000-000000000000", event["entryCode"]),
        join(client, "malformed", event["entryCode"]),
    ]
    errors = []
    for response in responses:
        assert count_rows(db, "participants") == before
        assert response.status_code == 404
        error = response.json()["error"]
        assert error.pop("requestId") == response.headers["X-Request-ID"]
        errors.append(error)
    assert errors[0] == errors[1] == errors[2]
    assert errors[0]["code"] == "NOT_FOUND"
    assert (
        errors[0]["message"]
        == "We couldn't find an event with this code. Check the code and try again."
    )


def test_closed_event_checks_code_before_status(client, db, event):
    close_event(db, event["id"], datetime(2026, 10, 29, tzinfo=UTC))
    before = count_rows(db, "participants")
    for code, status, error_code in [
        (event["entryCode"], 409, "EVENT_CLOSED"),
        ("WRONG", 404, "NOT_FOUND"),
    ]:
        response = join(client, event["id"], code)
        assert count_rows(db, "participants") == before
        assert response.status_code == status
        assert response.json()["error"]["code"] == error_code
        if status == 409:
            assert (
                response.json()["error"]["message"] == "This event has ended, so you can't join it."
            )


@pytest.mark.parametrize(
    ("existing", "attempt"), [("Joon", "JOON"), ("Straße", "STRASSE"), (None, "MINA")]
)
def test_duplicate_name_is_rejected(client, db, event, existing, attempt):
    if existing:
        add_participant(db, event["id"], existing)
    before = count_rows(db, "participants")
    response = join(client, event["id"], event["entryCode"], attempt)
    assert count_rows(db, "participants") == before
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "DISPLAY_NAME_TAKEN"
    assert response.json()["error"]["details"] == {"field": "displayName"}


def test_join_logs_success_without_secrets_and_rejections_without_success_log(
    client, db, event, caplog
):
    caplog.set_level(logging.INFO)
    caplog.clear()
    response = join(client, event["id"], event["entryCode"], "Private Name")
    assert response.status_code == 201
    body = response.json()
    records = [r for r in caplog.records if r.name.startswith("app.")]
    joined = [r for r in records if r.getMessage() == "participant_joined"]
    assert len(joined) == 1
    assert joined[0].event_id == event["id"]
    assert joined[0].participant_id == body["event"]["me"]["participantId"]
    assert not hasattr(joined[0], "display_name")
    for record in records:
        for formatter in (JsonFormatter(), TextFormatter()):
            formatted = formatter.format(record)
            assert body["participantToken"] not in formatted
            assert event["entryCode"] not in formatted
    caplog.clear()
    before = count_rows(db, "participants")
    for response in [
        join(client, event["id"], "WRONG"),
        join(client, event["id"], event["entryCode"], "PRIVATE NAME"),
        join(client, event["id"], event["entryCode"], " "),
    ]:
        assert response.status_code in (404, 409, 422)
        assert count_rows(db, "participants") == before
    assert not [
        r
        for r in caplog.records
        if r.name.startswith("app.") and r.getMessage() == "participant_joined"
    ]
