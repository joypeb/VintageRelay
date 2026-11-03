from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.exchange_intent import ExchangeIntent
from app.models.trade_participant import TradeParticipant
from app.models.trade_proposal import TradeProposal
from tests.api.test_intents_accept import action, seed_proposal
from tests.api.test_intents_register_list import assert_error
from tests.conftest import add_participant, close_event

pytest_plugins = ("tests.api.test_intents_accept",)


@pytest.mark.parametrize("closed", [False, True])
def test_decline_replay_unchanged_even_after_closure(client, db, exchange, closed):
    event, _, _, _, _, intent = exchange
    with db.write() as session:
        session.get(ExchangeIntent, intent).status = "declined"
    with db.read() as session:
        before = session.get(ExchangeIntent, intent).updated_at
    if closed:
        close_event(db, event["event"]["id"], datetime.now(UTC))
    response = action(client, intent, event["participantToken"], "decline")
    assert response.status_code == 200
    assert response.json()["id"] == intent and response.json()["status"] == "declined"
    with db.read() as session:
        assert session.get(ExchangeIntent, intent).updated_at == before


def test_decline_invalidates_pending_but_keeps_confirmed(client, db, exchange):
    event, _, _, _, _, intent = exchange
    pending_id = seed_proposal(db, exchange, "pending")
    confirmed_id = seed_proposal(db, exchange, "confirmed", "consented", "consented")
    response = action(client, intent, event["participantToken"], "decline")
    assert response.status_code == 200 and response.json()["status"] == "declined"
    with db.read() as session:
        assert session.get(ExchangeIntent, intent).status == "declined"
        pending = session.get(TradeProposal, pending_id)
        assert (pending.status, pending.end_reason) == ("invalidated", "intent_changed")
        assert pending.ended_at is not None
        confirmed = session.get(TradeProposal, confirmed_id)
        assert confirmed.status == "confirmed" and confirmed.ended_at is None
        assert all(
            p.is_confirmed
            for p in session.scalars(
                select(TradeParticipant).where(TradeParticipant.proposal_id == confirmed_id)
            ).all()
        )
    assert action(client, intent, event["participantToken"], "decline").status_code == 200


def test_decline_visibility_and_owner_permission(client, db, exchange):
    event, _, sender, foreign, _, intent = exchange
    _, outsider = add_participant(db, event["event"]["id"], "Outsider")
    assert_error(action(client, intent, sender, "decline"), 403, "FORBIDDEN")
    for token in (outsider, foreign["participantToken"]):
        assert_error(action(client, intent, token, "decline"), 404, "NOT_FOUND")
    assert_error(
        action(client, str(uuid4()), event["participantToken"], "decline"), 404, "NOT_FOUND"
    )


@pytest.mark.parametrize("status", ["withdrawn", "invalidated"])
def test_decline_rejects_inactive_intent(client, db, exchange, status):
    event, _, _, _, _, intent = exchange
    with db.write() as session:
        session.get(ExchangeIntent, intent).status = status
    assert_error(
        action(client, intent, event["participantToken"], "decline"), 409, "INTENT_NOT_ACTIVE"
    )


def test_decline_active_after_closure_is_rejected(client, db, exchange):
    event, _, _, _, _, intent = exchange
    close_event(db, event["event"]["id"], datetime.now(UTC))
    assert_error(action(client, intent, event["participantToken"], "decline"), 409, "EVENT_CLOSED")
    with db.read() as session:
        assert session.get(ExchangeIntent, intent).status == "active"
