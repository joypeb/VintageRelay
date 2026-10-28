import re

import app.models  # noqa: F401

PAYLOAD = {"name": "Mangwon Flea Market Swap Corner", "organizerDisplayName": "Mina"}


def test_valid_create_returns_event_session(client):
    response = client.post("/api/v1/events", json=PAYLOAD, headers={"X-Request-ID": "create-1"})

    assert response.status_code == 201
    assert response.headers["X-Request-ID"] == "create-1"
    body = response.json()
    assert set(body) == {"event", "participantToken"}
    event = body["event"]
    assert set(event) == {
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
    assert event["name"] == PAYLOAD["name"]
    assert event["status"] == "active"
    assert event["closedAt"] is None
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", event["createdAt"])
    assert re.fullmatch(r"[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}", event["entryCode"])
    assert event["entryUrl"] == f"https://vintage-relay.test/join?code={event['entryCode']}"
    assert event["me"] == {
        "participantId": event["organizerParticipantId"],
        "displayName": "Mina",
        "isOrganizer": True,
    }
    assert event["stats"] == {
        "participantCount": 1,
        "availableClothingCount": 0,
        "confirmedExchangeCount": 0,
    }
    assert body["participantToken"]


def test_padded_names_are_trimmed(client):
    response = client.post(
        "/api/v1/events",
        json={"name": "  Mangwon Flea Market Swap Corner  ", "organizerDisplayName": "  Mina  "},
    )

    assert response.status_code == 201
    assert response.json()["event"]["name"] == PAYLOAD["name"]
    assert response.json()["event"]["me"]["displayName"] == "Mina"


def test_authorization_header_does_not_prevent_creation(client):
    response = client.post(
        "/api/v1/events", json=PAYLOAD, headers={"Authorization": "Bearer whatever"}
    )

    assert response.status_code == 201


def test_identical_requests_create_distinct_sessions(client):
    first = client.post("/api/v1/events", json=PAYLOAD)
    second = client.post("/api/v1/events", json=PAYLOAD)

    assert first.status_code == second.status_code == 201
    a, b = first.json(), second.json()
    for key in ("id", "organizerParticipantId", "entryCode"):
        assert a["event"][key] != b["event"][key]
    assert a["participantToken"] != b["participantToken"]
