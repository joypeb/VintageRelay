from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.exchange_intent import ExchangeIntent
from app.models.trade_participant import TradeParticipant
from app.models.trade_proposal import TradeProposal
from tests.api.test_intents_register_list import assert_error, auth, seed_intent
from tests.conftest import add_participant, close_event

pytest_plugins = ("tests.api.test_list_clothing",)


@pytest.fixture
def intent_context(db, list_context):
    event, participant, token, foreign, rows = list_context
    event_id = event["event"]["id"]
    offered, wanted = rows["mine_available"]["id"], rows["other_available"]["id"]
    intent_id = seed_intent(db, event_id, participant.id, offered, wanted)
    return event, participant, token, foreign, offered, wanted, intent_id


def withdraw(client, intent_id, token):
    return client.delete(f"/api/v1/intents/{intent_id}", headers=auth(token))


def test_withdraw_visibility_and_sender_permission(client, db, intent_context):
    event, _, token, foreign, _, _, intent_id = intent_context
    _, outsider = add_participant(db, event["event"]["id"], "Outsider")
    assert_error(withdraw(client, intent_id, event["participantToken"]), 403, "FORBIDDEN")
    for viewer in (outsider, foreign["participantToken"]):
        assert_error(withdraw(client, intent_id, viewer), 404, "NOT_FOUND")
    assert_error(withdraw(client, str(uuid4()), token), 404, "NOT_FOUND")


@pytest.mark.parametrize("status", ["withdrawn", "declined", "invalidated"])
@pytest.mark.parametrize("closed", [False, True])
def test_withdraw_inactive_replay_is_204_without_changes(
    client, db, intent_context, status, closed
):
    event, participant, token, _, offered, wanted, _ = intent_context
    event_id = event["event"]["id"]
    intent_id = seed_intent(db, event_id, participant.id, offered, wanted, status)
    if closed:
        close_event(db, event_id, datetime.now(UTC))
    with db.read() as session:
        before = session.get(ExchangeIntent, intent_id).updated_at
    response = withdraw(client, intent_id, token)
    assert response.status_code == 204 and response.content == b""
    with db.read() as session:
        intent = session.get(ExchangeIntent, intent_id)
        assert (intent.status, intent.updated_at) == (status, before)


def test_withdraw_active_after_closure_is_rejected(client, db, intent_context):
    event, _, token, _, _, _, intent_id = intent_context
    close_event(db, event["event"]["id"], datetime.now(UTC))
    assert_error(withdraw(client, intent_id, token), 409, "EVENT_CLOSED")
    with db.read() as session:
        assert session.get(ExchangeIntent, intent_id).status == "active"


def test_withdraw_invalidates_dependent_pending_but_keeps_confirmed(client, db, intent_context):
    event, participant, token, _, offered, wanted, intent_id = intent_context
    now = datetime.now(UTC)
    pending_id, confirmed_id, unrelated_id = (str(uuid4()) for _ in range(3))
    with db.write() as session:
        for proposal_id, status in (
            (pending_id, "pending"),
            (confirmed_id, "confirmed"),
            (unrelated_id, "pending"),
        ):
            session.add(
                TradeProposal(
                    id=proposal_id,
                    event_id=event["event"]["id"],
                    version=1,
                    status=status,
                    cycle_key=proposal_id,
                    created_at=now,
                    confirmed_at=now if status == "confirmed" else None,
                )
            )
        session.flush()
        for proposal_id in (pending_id, confirmed_id):
            session.add(
                TradeParticipant(
                    id=str(uuid4()),
                    proposal_id=proposal_id,
                    participant_id=participant.id,
                    offered_clothing_id=offered,
                    offered_content_version=1,
                    received_clothing_id=wanted,
                    response="consented",
                    responded_at=now,
                    is_confirmed=proposal_id == confirmed_id,
                )
            )
    response = withdraw(client, intent_id, token)
    assert response.status_code == 204 and response.content == b""
    with db.read() as session:
        assert session.get(ExchangeIntent, intent_id).status == "withdrawn"
        pending = session.get(TradeProposal, pending_id)
        assert pending.status == "invalidated" and pending.end_reason == "intent_changed"
        assert pending.ended_at is not None
        confirmed = session.get(TradeProposal, confirmed_id)
        assert confirmed.status == "confirmed" and confirmed.ended_at is None
        assert session.get(TradeProposal, unrelated_id).status == "pending"
        assert (
            session.scalar(
                select(TradeParticipant.is_confirmed).where(
                    TradeParticipant.proposal_id == confirmed_id
                )
            )
            is True
        )
    assert withdraw(client, intent_id, token).status_code == 204
