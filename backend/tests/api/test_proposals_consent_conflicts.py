from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Barrier

import pytest
from sqlalchemy import select

from app.models.clothing import Clothing
from app.models.trade_participant import TradeParticipant
from app.models.trade_proposal import TradeProposal
from tests.api.test_intents_accept import action
from tests.api.test_intents_register_list import assert_error, auth, seed_intent
from tests.conftest import close_event

pytest_plugins = ("tests.api.test_intents_accept",)


def proposal_action(client, proposal, token, verb="consents", version=1):
    return client.post(
        f"/api/v1/proposals/{proposal}/{verb}", headers=auth(token), json={"version": version}
    )


@pytest.fixture
def accepted(client, db, exchange):
    event, _, _, _, _, intent = exchange
    response = action(client, intent, event["participantToken"])
    assert response.status_code == 200
    return exchange, response.json()["id"]


def test_final_consent_confirms_and_replays_after_closure(client, db, accepted):
    (event, _, token, _, rows, _), proposal = accepted
    response = proposal_action(client, proposal, token)
    assert response.status_code == 200 and response.json()["status"] == "confirmed"
    with db.read() as session:
        parties = session.scalars(
            select(TradeParticipant).where(TradeParticipant.proposal_id == proposal)
        ).all()
        assert len(parties) == 2 and all(
            p.response == "consented" and p.is_confirmed for p in parties
        )
        assert all(
            session.get(Clothing, rows[key]["id"]).status == "confirmed"
            for key in ("mine_available", "other_available")
        )
    close_event(db, event["event"]["id"], datetime.now(UTC))
    replay = proposal_action(client, proposal, token)
    assert replay.status_code == 200 and replay.json()["status"] == "confirmed"


def test_stale_version_has_current_status_and_latest_proposal(client, accepted):
    (_, _, token, _, _, _), proposal = accepted
    error = assert_error(
        proposal_action(client, proposal, token, version=2), 409, "PROPOSAL_VERSION_MISMATCH"
    )
    assert error["details"] == {"currentStatus": "pending", "latestProposalId": proposal}


@pytest.mark.parametrize("closed", [False, True])
def test_pending_consent_replay(client, db, accepted, closed):
    (event, _, _, _, _, _), proposal = accepted
    if closed:
        close_event(db, event["event"]["id"], datetime.now(UTC))
    response = proposal_action(client, proposal, event["participantToken"])
    assert response.status_code == 200 and response.json()["status"] == "pending"


@pytest.mark.parametrize("status", ["rejected", "invalidated", "cancelled"])
@pytest.mark.parametrize("closed", [False, True])
def test_ended_consent_replay_is_rejected(client, db, accepted, status, closed):
    (event, _, _, _, _, _), proposal = accepted
    with db.write() as session:
        row = session.get(TradeProposal, proposal)
        row.status, row.ended_at = status, datetime.now(UTC)
    if closed:
        close_event(db, event["event"]["id"], datetime.now(UTC))
    error = assert_error(
        proposal_action(client, proposal, event["participantToken"]),
        409,
        "EVENT_CLOSED" if closed else "PROPOSAL_VERSION_MISMATCH",
    )
    if not closed:
        assert error["details"] == {"currentStatus": status, "latestProposalId": None}


def test_reject_and_replay_after_closure(client, db, accepted):
    (event, _, token, _, _, _), proposal = accepted
    response = proposal_action(client, proposal, token, "reject")
    assert response.status_code == 200
    assert (response.json()["status"], response.json()["endReason"]) == (
        "rejected",
        "participant_rejected",
    )
    close_event(db, event["event"]["id"], datetime.now(UTC))
    replay = proposal_action(client, proposal, token, "reject")
    assert replay.status_code == 200 and replay.json()["status"] == "rejected"


def test_overlapping_final_consents_have_one_winner(client, db, accepted):
    (event, sender, token, _, rows, _), first = accepted
    event_id = event["event"]["id"]
    alternative = rows["other_withdrawn"]["id"]
    with db.write() as session:
        session.get(Clothing, alternative).status = "available"
    other_intent = seed_intent(db, event_id, sender.id, rows["mine_available"]["id"], alternative)
    response = action(client, other_intent, event["participantToken"])
    assert response.status_code == 200
    second = response.json()["id"]
    barrier = Barrier(2)

    def consent(proposal):
        barrier.wait(timeout=5)
        return proposal_action(client, proposal, token)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(consent, (first, second)))
    assert sorted(r.status_code for r in results) == [200, 409]
    with db.read() as session:
        proposals = [session.get(TradeProposal, p) for p in (first, second)]
        assert sorted(p.status for p in proposals) == ["confirmed", "invalidated"]
        loser = next(p for p in proposals if p.status == "invalidated")
        assert loser.end_reason == "clothing_confirmed_elsewhere" and loser.ended_at
        confirmed = session.scalars(
            select(TradeParticipant).where(TradeParticipant.is_confirmed.is_(True))
        ).all()
        assert len(confirmed) == 2 and len({p.offered_clothing_id for p in confirmed}) == 2
