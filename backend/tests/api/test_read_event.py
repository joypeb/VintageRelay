from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from tests.conftest import add_participant, close_event, count_rows


def create_event(client):
    response = client.post(
        "/api/v1/events",
        json={"name": "Mangwon Flea Market Swap Corner", "organizerDisplayName": "Mina"},
    )
    assert response.status_code == 201
    return response.json()


def read(client, event_id, token, **headers):
    return client.get(
        f"/api/v1/events/{event_id}", headers={"Authorization": f"Bearer {token}", **headers}
    )


def assert_common(body, event):
    assert set(body) == {
        "id",
        "name",
        "status",
        "entryCode",
        "entryUrl",
        "organizerParticipantId",
        "createdAt",
        "closedAt",
        "me",
        "stats",
    }
    assert body["name"] == "Mangwon Flea Market Swap Corner"
    assert body["organizerParticipantId"] == event["organizerParticipantId"]
    assert body["entryCode"] == event["entryCode"]
    assert body["entryUrl"] == f"https://vintage-relay.test/join?code={body['entryCode']}"
    assert body["createdAt"].endswith("Z")


def test_regular_participant_reads_event_without_secrets(client, db):
    created = create_event(client)
    event = created["event"]
    participant, token = add_participant(db, event["id"], "Joon")
    response = read(client, event["id"], token)
    assert response.status_code == 200
    body = response.json()
    assert_common(body, event)
    assert body["status"] == "active"
    assert body["closedAt"] is None
    assert body["me"] == {
        "participantId": participant.id,
        "displayName": "Joon",
        "isOrganizer": False,
    }
    assert body["stats"] is None
    assert "participantToken" not in body
    assert token not in response.text and created["participantToken"] not in response.text


def test_organizer_reads_own_identity_and_created_event(client, db):
    created = create_event(client)
    event = created["event"]
    _, token = add_participant(db, event["id"], "Joon")
    response = read(client, event["id"], created["participantToken"])
    assert response.status_code == 200
    body = response.json()
    assert_common(body, event)
    assert body["me"] == {
        "participantId": event["organizerParticipantId"],
        "displayName": "Mina",
        "isOrganizer": True,
    }
    assert {k: v for k, v in body.items() if k not in {"me", "stats"}} == {
        k: v for k, v in event.items() if k not in {"me", "stats"}
    }
    assert "participantToken" not in body
    assert token not in response.text and created["participantToken"] not in response.text


def test_repeated_read_has_no_side_effects_and_echoes_request_id(client, db):
    created = create_event(client)
    event_id = created["event"]["id"]
    counts = (count_rows(db, "events"), count_rows(db, "participants"))
    query = text("SELECT status, closed_at, organizer_participant_id FROM events WHERE id = :id")
    with db.read() as session:
        before = session.execute(query, {"id": event_id}).one()
    first = read(client, event_id, created["participantToken"], **{"X-Request-ID": "rd-1"})
    second = read(client, event_id, created["participantToken"])
    assert first.status_code == second.status_code == 200
    assert first.headers["X-Request-ID"] == "rd-1"
    assert first.json() == second.json()
    assert counts == (count_rows(db, "events"), count_rows(db, "participants"))
    with db.read() as session:
        after = session.execute(query, {"id": event_id}).one()
    assert after == before


@pytest.mark.parametrize("role", ["organizer", "participant"])
def test_closed_event_remains_readable(client, db, role):
    created = create_event(client)
    event = created["event"]
    participant, token = add_participant(db, event["id"], "Joon")
    close_event(db, event["id"], datetime(2026, 10, 27, 9, 0, tzinfo=UTC))
    if role == "organizer":
        token = created["participantToken"]
    response = read(client, event["id"], token)
    assert response.status_code == 200
    body = response.json()
    assert_common(body, event)
    assert body["status"] == "closed"
    assert body["closedAt"] == "2026-10-27T09:00:00.000Z"
    if role == "organizer":
        assert body["me"] == event["me"]
    else:
        assert body["me"] == {
            "participantId": participant.id,
            "displayName": "Joon",
            "isOrganizer": False,
        }
        assert body["stats"] is None
    assert "participantToken" not in body
    assert token not in response.text and created["participantToken"] not in response.text
