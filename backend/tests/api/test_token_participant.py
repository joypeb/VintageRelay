from typing import get_args

import pytest
from fastapi import FastAPI


def add_test_route(app: FastAPI) -> None:
    from app.api.deps import TokenParticipant, get_token_participant

    assert get_args(TokenParticipant)[1].dependency is get_token_participant

    @app.get("/test-token-participant")
    def read_participant(participant: TokenParticipant) -> dict[str, str]:
        return {"participantId": participant.id}


@pytest.mark.parametrize("authorization", [None, "Bearer ", "Bearer unknown-token"])
def test_token_participant_rejects_invalid_credentials(app, client, authorization):
    add_test_route(app)
    headers = {} if authorization is None else {"Authorization": authorization}
    response = client.get("/test-token-participant", headers=headers)

    assert response.status_code == 401
    body = response.json()
    assert set(body) == {"error"}
    error = body["error"]
    assert set(error) == {"code", "message", "details", "requestId"}
    assert error["code"] == "UNAUTHENTICATED"
    assert isinstance(error["message"], str) and error["message"]
    assert error["details"] is None
    assert error["requestId"] == response.headers["X-Request-ID"]


def test_token_participant_resolves_participants_from_any_event(app, client):
    add_test_route(app)
    for name in ("Event A", "Event B"):
        created = client.post("/api/v1/events", json={"name": name, "organizerDisplayName": "Mina"})
        assert created.status_code == 201
        event = created.json()
        response = client.get(
            "/test-token-participant",
            headers={"Authorization": f"Bearer {event['participantToken']}"},
        )
        assert response.status_code == 200
        assert response.json() == {"participantId": event["event"]["organizerParticipantId"]}
