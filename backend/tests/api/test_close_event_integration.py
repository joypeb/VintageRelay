from sqlalchemy import select

from app.models.participant import Participant
from tests.conftest import add_participant


def test_create_close_replay_and_read_as_both_participants(client, db):
    created_response = client.post(
        "/api/v1/events", json={"name": "Swap", "organizerDisplayName": "Mina"}
    )
    other_response = client.post(
        "/api/v1/events", json={"name": "Other", "organizerDisplayName": "Alex"}
    )
    assert created_response.status_code == other_response.status_code == 201
    created, other = created_response.json(), other_response.json()
    event = created["event"]
    participant, participant_token = add_participant(db, event["id"], "Joon")
    organizer_token = created["participantToken"]
    event_path = f"/api/v1/events/{event['id']}"
    organizer_headers = {"Authorization": f"Bearer {organizer_token}"}
    participant_headers = {"Authorization": f"Bearer {participant_token}"}
    other_path = f"/api/v1/events/{other['event']['id']}"
    other_headers = {"Authorization": f"Bearer {other['participantToken']}"}
    before_other = client.get(other_path, headers=other_headers)
    assert before_other.status_code == 200
    assert before_other.json()["status"] == "active"
    with db.read() as session:
        participants_before = session.execute(
            select(
                Participant.id,
                Participant.event_id,
                Participant.display_name,
                Participant.session_token_hash,
            )
            .where(Participant.event_id == event["id"])
            .order_by(Participant.id)
        ).all()

    closed = client.post(f"{event_path}/close", headers=organizer_headers)
    replay = client.post(f"{event_path}/close", headers=organizer_headers)
    organizer_read = client.get(event_path, headers=organizer_headers)
    participant_read = client.get(event_path, headers=participant_headers)
    forbidden = client.post(f"{event_path}/close", headers=participant_headers)
    after_other = client.get(other_path, headers=other_headers)

    assert closed.status_code == replay.status_code == organizer_read.status_code == 200
    assert participant_read.status_code == 200
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "FORBIDDEN"
    assert after_other.status_code == 200 and after_other.json() == before_other.json()
    result = closed.json()
    assert result["status"] == "closed" and result["closedAt"] is not None
    assert replay.json() == organizer_read.json() == result
    assert result["stats"] == {
        "participantCount": 2,
        "availableClothingCount": 0,
        "confirmedExchangeCount": 0,
    }
    for key in ("id", "name", "entryCode", "entryUrl", "organizerParticipantId", "createdAt", "me"):
        assert result[key] == event[key]
    regular_result = participant_read.json()
    for key in (
        "id",
        "name",
        "entryCode",
        "entryUrl",
        "organizerParticipantId",
        "createdAt",
        "status",
        "closedAt",
    ):
        assert regular_result[key] == result[key]
    assert regular_result["me"] == {
        "participantId": participant.id,
        "displayName": "Joon",
        "isOrganizer": False,
    }
    assert regular_result["stats"] is None
    with db.read() as session:
        participants_after = session.execute(
            select(
                Participant.id,
                Participant.event_id,
                Participant.display_name,
                Participant.session_token_hash,
            )
            .where(Participant.event_id == event["id"])
            .order_by(Participant.id)
        ).all()
    assert participants_after == participants_before
    secrets = [organizer_token, participant_token, other["participantToken"]]
    secrets.extend(row.session_token_hash for row in participants_before)
    for response in (
        closed,
        replay,
        organizer_read,
        participant_read,
        forbidden,
        before_other,
        after_other,
    ):
        assert all(secret not in response.text for secret in secrets)
        assert "participantToken" not in response.text and "session_token_hash" not in response.text
