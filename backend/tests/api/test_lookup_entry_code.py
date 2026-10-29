import logging
from datetime import UTC, datetime

import pytest

from app.core.logging import JsonFormatter, TextFormatter
from tests.conftest import close_event, count_rows


@pytest.fixture
def event(client):
    response = client.post(
        "/api/v1/events",
        json={"name": "Mangwon Flea Market Swap Corner", "organizerDisplayName": "Mina"},
    )
    assert response.status_code == 201
    return response.json()["event"]


@pytest.mark.parametrize("variant", ["original", "lowercase", "padded"])
def test_lookup_active_event_matches_normalized_code(client, event, variant):
    code = event["entryCode"]
    value = {"original": code, "lowercase": code.lower(), "padded": f"%20{code}%20"}[variant]

    response = client.get(f"/api/v1/entry-codes/{value}")

    assert response.status_code == 200
    assert response.json() == {"eventId": event["id"], "name": event["name"], "status": "active"}


def test_lookup_closed_event_returns_closed_status(client, db, event):
    close_event(db, event["id"], datetime(2026, 10, 27, 9, 0, tzinfo=UTC))

    response = client.get(f"/api/v1/entry-codes/{event['entryCode']}")

    assert response.status_code == 200
    assert response.json() == {"eventId": event["id"], "name": event["name"], "status": "closed"}


def test_lookup_unknown_code_returns_specific_error_and_request_id(client):
    response = client.get("/api/v1/entry-codes/UNKNOWN")

    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "NOT_FOUND"
    assert (
        error["message"]
        == "We couldn't find an event with this code. Check the code and try again."
    )
    assert response.headers["X-Request-ID"] == error["requestId"]


def test_lookup_ignores_authorization_header(client, event):
    response = client.get(
        f"/api/v1/entry-codes/{event['entryCode']}", headers={"Authorization": "Bearer garbage"}
    )

    assert response.status_code == 200
    assert response.json() == {"eventId": event["id"], "name": event["name"], "status": "active"}


def test_lookup_does_not_create_participant(client, db, event):
    before = count_rows(db, "participants")

    response = client.get(f"/api/v1/entry-codes/{event['entryCode']}")

    assert response.status_code == 200
    assert count_rows(db, "participants") == before


def test_successful_lookup_does_not_log_raw_code(client, event, caplog):
    code = event["entryCode"]
    caplog.clear()
    caplog.set_level(logging.INFO)

    response = client.get(f"/api/v1/entry-codes/{code}")

    assert response.status_code == 200
    records = [record for record in caplog.records if record.name.startswith("app.")]
    assert any(record.getMessage() == "request" for record in records)
    for record in records:
        for formatter in (JsonFormatter(), TextFormatter()):
            assert code not in formatter.format(record)
