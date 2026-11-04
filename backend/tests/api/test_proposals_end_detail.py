from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.exchange_intent import ExchangeIntent
from app.models.trade_proposal import TradeProposal
from tests.api.test_intents_accept import action, seed_proposal
from tests.api.test_intents_register_list import auth, post, seed_intent
from tests.api.test_intents_withdraw import withdraw
from tests.api.test_proposals_consent_conflicts import proposal_action
from tests.api.test_proposals_three_person import close_loop, proposals

pytest_plugins = (
    "tests.api.test_intents_accept",
    "tests.api.test_proposals_consent_conflicts",
    "tests.api.test_proposals_three_person",
)


def read_proposal(client, event_id, proposal_id, token, view):
    if view == "detail":
        response = client.get(f"/api/v1/proposals/{proposal_id}", headers=auth(token))
        assert response.status_code == 200
        return response.json()
    response = client.get(f"/api/v1/events/{event_id}/proposals", headers=auth(token))
    assert response.status_code == 200
    return next(item for item in response.json()["items"] if item["id"] == proposal_id)


@pytest.mark.parametrize("view", ["list", "detail"])
@pytest.mark.parametrize("viewer", ["sender", "owner"])
@pytest.mark.parametrize(
    "ending,expected", [("decline", "intent_declined"), ("withdraw", "intent_withdrawn")]
)
def test_ended_intent_detail_visible_to_both_parties(
    client, db, exchange, view, viewer, ending, expected
):
    event, _, sender, _, _, intent = exchange
    proposal = seed_proposal(db, exchange, "pending")
    if ending == "decline":
        assert action(client, intent, event["participantToken"], "decline").status_code == 200
    else:
        assert withdraw(client, intent, sender).status_code == 204
    token = sender if viewer == "sender" else event["participantToken"]
    body = read_proposal(client, event["event"]["id"], proposal, token, view)
    assert (body["status"], body["endReason"]) == ("invalidated", "intent_changed")
    assert body["endDetail"] == expected


@pytest.mark.parametrize("view", ["list", "detail"])
def test_declined_third_party_leg_visible_to_other_cycle_participant(
    client, db, three_people, view
):
    event_id, people, _, legs = three_people
    close_loop(client, db, three_people)
    proposal = proposals(db, legs)[0]
    with db.read() as session:
        intent = session.scalar(
            select(ExchangeIntent).where(
                ExchangeIntent.participant_id == people[1][0],
                ExchangeIntent.offered_clothing_id == legs[1][1],
                ExchangeIntent.wanted_clothing_id == legs[1][2],
            )
        ).id
    assert action(client, intent, people[2][1], "decline").status_code == 200
    body = read_proposal(client, event_id, proposal.id, people[0][1], view)
    assert (body["status"], body["endReason"]) == ("invalidated", "intent_changed")
    assert body["endDetail"] == "intent_declined"


@pytest.mark.parametrize("view", ["list", "detail"])
@pytest.mark.parametrize(
    "status,reason",
    [
        ("pending", None),
        ("confirmed", None),
        ("rejected", "participant_rejected"),
        ("cancelled", "participant_cancelled"),
        ("invalidated", "clothing_withdrawn"),
        ("invalidated", "clothing_confirmed_elsewhere"),
    ],
)
def test_other_proposal_states_have_null_end_detail(client, db, exchange, view, status, reason):
    event, _, token, _, _, _ = exchange
    proposal = seed_proposal(db, exchange, status)
    with db.write() as session:
        row = session.get(TradeProposal, proposal)
        row.end_reason = reason
        if status in ("rejected", "cancelled", "invalidated"):
            row.ended_at = datetime.now(UTC)
    body = read_proposal(client, event["event"]["id"], proposal, token, view)
    assert (body["status"], body["endReason"]) == (status, reason)
    assert body["endDetail"] is None


@pytest.mark.parametrize("view", ["list", "detail"])
def test_new_active_request_does_not_hide_original_decline(client, db, exchange, view):
    event, _, sender, _, rows, intent = exchange
    event_id = event["event"]["id"]
    proposal = seed_proposal(db, exchange, "pending")
    assert action(client, intent, event["participantToken"], "decline").status_code == 200
    response = post(
        client, event_id, sender, rows["mine_available"]["id"], rows["other_available"]["id"]
    )
    assert response.status_code == 201 and response.json()["status"] == "active"
    body = read_proposal(client, event_id, proposal, sender, view)
    assert (body["status"], body["endReason"]) == ("invalidated", "intent_changed")
    assert body["endDetail"] == "intent_declined"


def test_openapi_proposal_end_detail_is_nullable_enum(client):
    schema = client.get("/openapi.json").json()["components"]["schemas"]["Proposal"]
    options = schema["properties"]["endDetail"]["anyOf"]
    assert {option.get("type") for option in options} == {"string", "null"}
    assert next(option["enum"] for option in options if option.get("type") == "string") == [
        "intent_declined",
        "intent_withdrawn",
        "intent_invalidated",
    ]


@pytest.mark.parametrize("view", ["list", "detail"])
def test_new_request_withdrawal_does_not_inherit_previous_decline(client, db, exchange, view):
    event, _, sender, _, rows, first_intent = exchange
    event_id = event["event"]["id"]
    first_proposal = seed_proposal(db, exchange, "pending")
    assert action(client, first_intent, event["participantToken"], "decline").status_code == 200
    response = post(
        client, event_id, sender, rows["mine_available"]["id"], rows["other_available"]["id"]
    )
    assert response.status_code == 201
    second_intent = response.json()["id"]
    response = action(client, second_intent, event["participantToken"])
    assert response.status_code == 200
    second_proposal = response.json()["id"]
    assert second_proposal != first_proposal
    assert withdraw(client, second_intent, sender).status_code == 204

    for proposal, expected in (
        (first_proposal, "intent_declined"),
        (second_proposal, "intent_withdrawn"),
    ):
        body = read_proposal(client, event_id, proposal, sender, view)
        assert (body["status"], body["endReason"], body["endDetail"]) == (
            "invalidated",
            "intent_changed",
            expected,
        )


@pytest.mark.parametrize("view", ["list", "detail"])
def test_old_decline_on_other_leg_does_not_override_withdrawal(client, db, exchange, view):
    event, _, sender, _, rows, intent = exchange
    event_id = event["event"]["id"]
    seed_intent(
        db,
        event_id,
        event["event"]["organizerParticipantId"],
        rows["other_available"]["id"],
        rows["mine_available"]["id"],
        "declined",
        age=5,
    )
    response = action(client, intent, event["participantToken"])
    assert response.status_code == 200
    proposal = response.json()["id"]
    assert withdraw(client, intent, sender).status_code == 204

    body = read_proposal(client, event_id, proposal, sender, view)
    assert (body["status"], body["endReason"], body["endDetail"]) == (
        "invalidated",
        "intent_changed",
        "intent_withdrawn",
    )


@pytest.mark.parametrize("view", ["list", "detail"])
def test_consent_recheck_of_earlier_intent_change_has_no_end_detail(client, db, accepted, view):
    (event, _, token, _, _, intent), proposal = accepted
    with db.write() as session:
        row = session.get(ExchangeIntent, intent)
        row.status = "withdrawn"
        row.updated_at = datetime.now(UTC) - timedelta(minutes=1)
    response = proposal_action(client, proposal, token)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INTENT_NOT_ACTIVE"
    with db.read() as session:
        assert (
            session.get(ExchangeIntent, intent).updated_at
            != session.get(TradeProposal, proposal).ended_at
        )

    body = read_proposal(client, event["event"]["id"], proposal, token, view)
    assert (body["status"], body["endReason"], body["endDetail"]) == (
        "invalidated",
        "intent_changed",
        None,
    )
