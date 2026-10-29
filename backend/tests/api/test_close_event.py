from datetime import UTC, datetime

import pytest

import app.services.event as event_service
from tests.api.test_read_event_auth import assert_error
from tests.conftest import add_participant, close_event
from tests.services.test_close_event import snapshot


@pytest.fixture
def events(client):
    def create(name):
        response = client.post(
            "/api/v1/events", json={"name": name, "organizerDisplayName": "Mina"}
        )
        assert response.status_code == 201
        return response.json()

    return create("Swap"), create("Other")


def headers(token):
    return {"Authorization": f"Bearer {token}"}


def path(event_id):
    return f"/api/v1/events/{event_id}/close"


def test_close_bodyless_persists_current_event(client, db, events):
    created, other = events
    original = created["event"]
    add_participant(db, original["id"], "Joon")
    before_other = client.get(
        f"/api/v1/events/{other['event']['id']}", headers=headers(other["participantToken"])
    ).json()
    response = client.post(path(original["id"]), headers=headers(created["participantToken"]))
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "closed" and result["closedAt"] is not None
    assert (
        datetime.fromisoformat(result["closedAt"].replace("Z", "+00:00"))
        .utcoffset()
        .total_seconds()
        == 0
    )
    for key in ("id", "name", "entryCode", "entryUrl", "organizerParticipantId", "createdAt", "me"):
        assert result[key] == original[key]
    assert result["stats"] == {
        "participantCount": 2,
        "availableClothingCount": 0,
        "confirmedExchangeCount": 0,
    }
    assert (
        client.get(
            f"/api/v1/events/{original['id']}", headers=headers(created["participantToken"])
        ).json()
        == result
    )
    assert (
        client.get(
            f"/api/v1/events/{other['event']['id']}", headers=headers(other["participantToken"])
        ).json()
        == before_other
    )
    assert created["participantToken"] not in response.text
    assert "session_token_hash" not in response.text and "participantToken" not in response.text
    replay = client.post(path(original["id"]), headers=headers(created["participantToken"]))
    assert replay.status_code == 200 and replay.json()["closedAt"] == result["closedAt"]


@pytest.mark.parametrize("auth", [None, "Basic abc", "Bearer ", "abc", "Bearer unknown"])
@pytest.mark.parametrize("target", ["own", "missing", "malformed"])
def test_authentication_precedes_lookup(client, db, events, auth, target):
    created, _ = events
    event_id = {
        "own": created["event"]["id"],
        "missing": "00000000-0000-4000-8000-000000000000",
        "malformed": "not-a-uuid",
    }[target]
    before = snapshot(db)
    response = client.post(path(event_id), headers={} if auth is None else {"Authorization": auth})
    assert_error(response, 401, "UNAUTHENTICATED")
    assert snapshot(db) == before


def test_entry_information_is_not_a_credential(client, db, events):
    created, _ = events
    before = snapshot(db)
    for value in (created["event"]["entryCode"], created["event"]["entryUrl"]):
        response = client.post(path(created["event"]["id"]), headers={"X-Entry-Code": value})
        assert_error(response, 401, "UNAUTHENTICATED")
    assert snapshot(db) == before


def test_inaccessible_targets_are_indistinguishable(client, db, events):
    created, other = events
    before = snapshot(db)
    errors = []
    for event_id in (other["event"]["id"], "00000000-0000-4000-8000-000000000000", "not-a-uuid"):
        response = client.post(path(event_id), headers=headers(created["participantToken"]))
        assert_error(response, 404, "NOT_FOUND")
        error = response.json()["error"]
        del error["requestId"]
        errors.append(error)
    assert errors[0] == errors[1] == errors[2]
    assert snapshot(db) == before


@pytest.mark.parametrize("closed", [False, True])
def test_regular_participant_is_forbidden(client, db, events, closed):
    created, _ = events
    event_id = created["event"]["id"]
    _, token = add_participant(db, event_id, "Joon")
    if closed:
        close_event(db, event_id, datetime(2026, 10, 29, tzinfo=UTC))
    before = snapshot(db)
    assert_error(client.post(path(event_id), headers=headers(token)), 403, "FORBIDDEN")
    assert snapshot(db) == before


def test_failure_is_safe_and_retry_succeeds(client_no_raise, db, monkeypatch):
    client = client_no_raise
    created = client.post(
        "/api/v1/events", json={"name": "Swap", "organizerDisplayName": "Mina"}
    ).json()
    event_id = created["event"]["id"]
    before = snapshot(db)
    original = event_service.build_event_read

    def fail(*args, **kwargs):
        raise RuntimeError("private failure marker")

    with monkeypatch.context() as patch:
        patch.setattr(event_service, "build_event_read", fail)
        response = client.post(
            path(event_id),
            headers={**headers(created["participantToken"]), "X-Request-ID": "close-failure"},
        )
    assert_error(response, 500, "INTERNAL_ERROR")
    assert response.headers["X-Request-ID"] == "close-failure"
    assert (
        "private failure marker" not in response.text
        and created["participantToken"] not in response.text
    )
    assert snapshot(db) == before
    assert event_service.build_event_read is original
    retry = client.post(path(event_id), headers=headers(created["participantToken"]))
    assert retry.status_code == 200 and retry.json()["status"] == "closed"
