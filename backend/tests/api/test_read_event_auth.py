import logging

import pytest

from app.core.logging import JsonFormatter


@pytest.fixture
def events(client):
    def create(name):
        response = client.post(
            "/api/v1/events", json={"name": name, "organizerDisplayName": "Mina"}
        )
        assert response.status_code == 201
        return response.json()

    return create("Event A"), create("Event B")


def assert_error(response, status, code):
    assert response.status_code == status
    assert response.status_code != 422
    body = response.json()
    assert set(body) == {"error"}
    error = body["error"]
    assert set(error) == {"code", "message", "details", "requestId"}
    assert error["code"] == code
    assert isinstance(error["message"], str) and error["message"]
    assert error["details"] is None
    assert error["requestId"] == response.headers["X-Request-ID"]


@pytest.mark.parametrize("auth", ["missing", "basic", "empty", "bare", "unknown"])
def test_invalid_credentials_return_401(client, events, auth):
    event, _ = events
    token = event["participantToken"]
    values = {
        "basic": f"Basic {token}",
        "empty": "Bearer ",
        "bare": token,
        "unknown": "Bearer not-a-real-token",
    }
    headers = {} if auth == "missing" else {"Authorization": values[auth]}
    response = client.get(f"/api/v1/events/{event['event']['id']}", headers=headers)
    assert_error(response, 401, "UNAUTHENTICATED")


@pytest.mark.parametrize("event_id", ["00000000-0000-4000-8000-000000000000", "not-a-uuid"])
@pytest.mark.parametrize("auth", [None, "Bearer not-a-real-token"])
def test_authentication_precedes_missing_or_malformed_event(client, events, event_id, auth):
    headers = {} if auth is None else {"Authorization": auth}
    response = client.get(f"/api/v1/events/{event_id}", headers=headers)
    assert_error(response, 401, "UNAUTHENTICATED")


@pytest.mark.parametrize("target", ["other", "missing", "malformed", "space"])
def test_inaccessible_event_returns_404(client, events, target):
    event, other = events
    headers = {"Authorization": f"Bearer {event['participantToken']}"}
    assert client.get(f"/api/v1/events/{event['event']['id']}", headers=headers).status_code == 200
    ids = {
        "other": other["event"]["id"],
        "missing": "00000000-0000-4000-8000-000000000000",
        "malformed": "not-a-uuid",
        "space": "%20",
    }
    response = client.get(f"/api/v1/events/{ids[target]}", headers=headers)
    assert_error(response, 404, "NOT_FOUND")


def test_inaccessible_event_errors_are_indistinguishable(client, events):
    event, other = events
    headers = {"Authorization": f"Bearer {event['participantToken']}"}
    assert client.get(f"/api/v1/events/{event['event']['id']}", headers=headers).status_code == 200
    errors = []
    for event_id in (other["event"]["id"], "00000000-0000-4000-8000-000000000000", "not-a-uuid"):
        response = client.get(f"/api/v1/events/{event_id}", headers=headers)
        assert_error(response, 404, "NOT_FOUND")
        error = response.json()["error"]
        del error["requestId"]
        errors.append(error)
    assert errors[0] == errors[1] == errors[2]


def test_read_and_invalid_token_do_not_log_tokens(client, events, caplog):
    event, _ = events
    token = event["participantToken"]
    caplog.set_level(logging.DEBUG)
    success = client.get(
        f"/api/v1/events/{event['event']['id']}", headers={"Authorization": f"Bearer {token}"}
    )
    failure = client.get(
        f"/api/v1/events/{event['event']['id']}",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert success.status_code == 200
    assert_error(failure, 401, "UNAUTHENTICATED")
    for record in caplog.records:
        for secret in (token, "not-a-real-token"):
            assert secret not in record.getMessage()
            assert secret not in JsonFormatter().format(record)
