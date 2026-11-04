from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.domain.matching import cycle_key
from app.models.trade_participant import TradeParticipant
from app.models.trade_proposal import TradeProposal
from tests.api.test_intents_register_list import assert_error, auth
from tests.conftest import add_participant, close_event

pytest_plugins = ("tests.api.test_list_clothing",)


def seed_proposal(db, context, status="pending", other="other_available", age=0):
    event, participant, _, _, rows = context
    event_id = event["event"]["id"]
    owner = event["event"]["organizerParticipantId"]
    offered, received = rows["mine_available"]["id"], rows[other]["id"]
    proposal_id = str(uuid4())
    now = datetime(2026, 10, 30, 12, tzinfo=UTC) - timedelta(minutes=age)
    with db.write() as session:
        session.add(
            TradeProposal(
                id=proposal_id,
                event_id=event_id,
                version=1,
                status=status,
                cycle_key=cycle_key(
                    [(participant.id, offered, received), (owner, received, offered)]
                ),
                created_at=now,
                end_reason="participant_rejected" if status == "rejected" else None,
                ended_at=now if status == "rejected" else None,
            )
        )
        session.flush()
        for person, give, receive, response in (
            (participant.id, offered, received, "pending"),
            (owner, received, offered, "consented"),
        ):
            session.add(
                TradeParticipant(
                    id=str(uuid4()),
                    proposal_id=proposal_id,
                    participant_id=person,
                    offered_clothing_id=give,
                    received_clothing_id=receive,
                    offered_content_version=1,
                    response=response,
                    responded_at=now if response == "consented" else None,
                    is_confirmed=False,
                )
            )
    return proposal_id


def test_proposal_reads_hide_nonparticipants_and_other_events(client, db, list_context):
    event, _, token, foreign, _ = list_context
    proposal = seed_proposal(db, list_context)
    event_id = event["event"]["id"]
    _, outsider = add_participant(db, event_id, "Outsider")
    detail = f"/api/v1/proposals/{proposal}"
    assert client.get(detail, headers=auth(token)).status_code == 200
    for viewer in (outsider, foreign["participantToken"]):
        assert_error(client.get(detail, headers=auth(viewer)), 404, "NOT_FOUND")
    assert_error(client.get(f"/api/v1/proposals/{uuid4()}", headers=auth(token)), 404, "NOT_FOUND")
    url = f"/api/v1/events/{event_id}/proposals"
    response = client.get(url, headers=auth(outsider))
    assert response.status_code == 200
    assert response.json() == {"items": [], "nextCursor": None}
    assert_error(client.get(url, headers=auth(foreign["participantToken"])), 404, "NOT_FOUND")


def test_list_proposals_filters_and_newest_first(client, db, list_context):
    event, _, token, _, rows = list_context
    older = seed_proposal(db, list_context, "rejected", age=2)
    middle = seed_proposal(db, list_context, "rejected", other="other_confirmed", age=1)
    newest = seed_proposal(db, list_context, age=0)
    url = f"/api/v1/events/{event['event']['id']}/proposals"

    def ids(params=None):
        response = client.get(url, headers=auth(token), params=params)
        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"items", "nextCursor"} and body["nextCursor"] is None
        return [item["id"] for item in body["items"]]

    assert ids() == [newest, middle, older]
    assert ids([("status", "pending")]) == [newest]
    assert ids([("status", "rejected"), ("status", "pending")]) == [newest, middle, older]
    assert ids({"clothingId": rows["other_confirmed"]["id"]}) == [middle]
    assert ids({"clothingId": rows["other_available"]["id"], "status": "rejected"}) == [older]
    assert ids({"clothingId": str(uuid4())}) == []
    assert_error(
        client.get(url, headers=auth(token), params={"status": "invalid"}), 422, "VALIDATION_ERROR"
    )


@pytest.mark.parametrize("closed", [False, True])
def test_proposal_schema_and_caller_actions(client, db, list_context, closed):
    event, participant, token, _, rows = list_context
    proposal = seed_proposal(db, list_context)
    event_id = event["event"]["id"]
    if closed:
        close_event(db, event_id, datetime.now(UTC))
    url = f"/api/v1/proposals/{proposal}"
    for viewer, my_id, my_response, can_consent, offered, received in (
        (token, participant.id, "pending", not closed, "mine_available", "other_available"),
        (
            event["participantToken"],
            event["event"]["organizerParticipantId"],
            "consented",
            False,
            "other_available",
            "mine_available",
        ),
    ):
        response = client.get(url, headers=auth(viewer))
        assert response.status_code == 200
        body = response.json()
        assert set(body) == {
            "id",
            "eventId",
            "version",
            "status",
            "endReason",
            "endDetail",
            "cycleSize",
            "participants",
            "myResponse",
            "canConsent",
            "canReject",
            "canCancel",
            "createdAt",
            "confirmedAt",
            "cancelledAt",
            "endedAt",
        }
        assert (
            body["id"],
            body["eventId"],
            body["version"],
            body["status"],
            body["cycleSize"],
        ) == (proposal, event_id, 1, "pending", 2)
        assert body["endReason"] is None
        assert body["myResponse"] == my_response
        assert (body["canConsent"], body["canReject"], body["canCancel"]) == (
            can_consent,
            not closed,
            False,
        )
        assert datetime.fromisoformat(body["createdAt"]) == datetime(2026, 10, 30, 12, tzinfo=UTC)
        assert body["createdAt"].endswith("Z")
        assert all(body[key] is None for key in ("confirmedAt", "cancelledAt", "endedAt"))
        parties = body["participants"]
        assert len(parties) == 2
        assert [p["isMe"] for p in parties] == [True, False]
        assert parties[0]["participant"]["participantId"] == my_id
        assert parties[0]["offeredClothing"]["id"] == rows[offered]["id"]
        assert parties[0]["receivedClothing"]["id"] == rows[received]["id"]
        assert parties[0]["response"] == my_response
        assert (parties[0]["respondedAt"] is None) == (my_response == "pending")
        for party in parties:
            assert set(party) == {
                "participant",
                "isMe",
                "offeredClothing",
                "receivedClothing",
                "response",
                "respondedAt",
            }
            assert set(party["participant"]) == {"participantId", "displayName", "isOrganizer"}
            for garment in (party["offeredClothing"], party["receivedClothing"]):
                assert set(garment) == {
                    "id",
                    "owner",
                    "photoUrl",
                    "category",
                    "title",
                    "description",
                    "status",
                    "contentVersion",
                }
                assert set(garment["owner"]) == {"participantId", "displayName", "isOrganizer"}
