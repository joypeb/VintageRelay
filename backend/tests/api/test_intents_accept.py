from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.domain.matching import cycle_key
from app.models.clothing import Clothing
from app.models.exchange_intent import ExchangeIntent
from app.models.trade_participant import TradeParticipant
from app.models.trade_proposal import TradeProposal
from tests.api.test_intents_register_list import assert_error, auth, seed_intent
from tests.conftest import add_participant, close_event

pytest_plugins = ("tests.api.test_list_clothing",)


@pytest.fixture
def exchange(db, list_context):
    event, sender, token, foreign, rows = list_context
    intent = seed_intent(
        db,
        event["event"]["id"],
        sender.id,
        rows["mine_available"]["id"],
        rows["other_available"]["id"],
        age=5,
    )
    return event, sender, token, foreign, rows, intent


def action(client, intent, token, verb="accept"):
    return client.post(f"/api/v1/intents/{intent}/{verb}", headers=auth(token))


def seed_proposal(db, exchange, status, sender_response="pending", owner_response="pending"):
    event, sender, _, _, rows, intent = exchange
    owner = event["event"]["organizerParticipantId"]
    offered, wanted = rows["mine_available"]["id"], rows["other_available"]["id"]
    proposal_id, now = str(uuid4()), datetime.now(UTC) - timedelta(minutes=1)
    with db.write() as session:
        session.add(
            TradeProposal(
                id=proposal_id,
                event_id=event["event"]["id"],
                version=1,
                status=status,
                cycle_key=cycle_key([(sender.id, offered, wanted), (owner, wanted, offered)]),
                created_at=now,
                ended_at=now if status == "rejected" else None,
                confirmed_at=now if status == "confirmed" else None,
            )
        )
        session.flush()
        for participant, give, receive, response in (
            (sender.id, offered, wanted, sender_response),
            (owner, wanted, offered, owner_response),
        ):
            session.add(
                TradeParticipant(
                    id=str(uuid4()),
                    proposal_id=proposal_id,
                    participant_id=participant,
                    offered_clothing_id=give,
                    received_clothing_id=receive,
                    offered_content_version=1,
                    response=response,
                    responded_at=now if response != "pending" else None,
                    is_confirmed=status == "confirmed",
                )
            )
        session.get(ExchangeIntent, intent).accepted_proposal_id = proposal_id
    return proposal_id


def test_accept_creates_reverse_proposal_and_owner_consent(client, db, exchange):
    event, sender, _, _, rows, intent = exchange
    response = action(client, intent, event["participantToken"])
    assert response.status_code == 200
    proposal = response.json()["id"]
    assert response.json()["status"] == "pending"
    with db.read() as session:
        assert session.get(ExchangeIntent, intent).accepted_proposal_id == proposal
        reverse = session.scalars(select(ExchangeIntent).where(ExchangeIntent.id != intent)).one()
        assert (
            reverse.participant_id,
            reverse.offered_clothing_id,
            reverse.wanted_clothing_id,
        ) == (
            event["event"]["organizerParticipantId"],
            rows["other_available"]["id"],
            rows["mine_available"]["id"],
        )
        parties = session.scalars(
            select(TradeParticipant).where(TradeParticipant.proposal_id == proposal)
        ).all()
        assert {p.participant_id: p.response for p in parties} == {
            sender.id: "pending",
            event["event"]["organizerParticipantId"]: "consented",
        }


def test_accept_reuses_reverse_intent_and_pending_proposal(client, db, exchange):
    event, sender, _, _, rows, intent = exchange
    owner = event["event"]["organizerParticipantId"]
    reverse = seed_intent(
        db,
        event["event"]["id"],
        owner,
        rows["other_available"]["id"],
        rows["mine_available"]["id"],
        age=5,
    )
    proposal = seed_proposal(db, exchange, "pending")
    with db.write() as session:
        session.get(ExchangeIntent, intent).accepted_proposal_id = None
        old = [session.get(ExchangeIntent, i).updated_at for i in (intent, reverse)]
    response = action(client, intent, event["participantToken"])
    assert response.status_code == 200 and response.json()["id"] == proposal
    with db.read() as session:
        assert len(session.scalars(select(ExchangeIntent)).all()) == 2
        assert all(
            session.get(ExchangeIntent, i).updated_at > t
            for i, t in zip((intent, reverse), old, strict=True)
        )
        assert session.get(ExchangeIntent, intent).accepted_proposal_id == proposal
        parties = session.scalars(
            select(TradeParticipant).where(TradeParticipant.proposal_id == proposal)
        ).all()
        assert {p.participant_id: p.response for p in parties} == {
            sender.id: "pending",
            owner: "consented",
        }


@pytest.mark.parametrize("status", ["pending", "confirmed"])
@pytest.mark.parametrize("closed", [False, True])
def test_accept_replay_existing_proposal(client, db, exchange, status, closed):
    event, _, _, _, _, intent = exchange
    proposal = seed_proposal(db, exchange, status, "consented", "consented")
    if closed:
        close_event(db, event["event"]["id"], datetime.now(UTC))
    response = action(client, intent, event["participantToken"])
    assert response.status_code == 200
    assert (response.json()["id"], response.json()["status"]) == (proposal, status)
    with db.read() as session:
        assert len(session.scalars(select(TradeProposal)).all()) == 1


def test_accept_after_rejection_lifts_suppression_with_fresh_consent(client, db, exchange):
    event, sender, _, _, rows, intent = exchange
    owner = event["event"]["organizerParticipantId"]
    reverse = seed_intent(
        db,
        event["event"]["id"],
        owner,
        rows["other_available"]["id"],
        rows["mine_available"]["id"],
        age=5,
    )
    old_id = seed_proposal(db, exchange, "rejected", "consented", "rejected")
    response = action(client, intent, event["participantToken"])
    assert response.status_code == 200
    new_id = response.json()["id"]
    assert new_id != old_id and response.json()["version"] == 2
    with db.read() as session:
        old = session.get(TradeProposal, old_id)
        assert all(
            session.get(ExchangeIntent, i).updated_at > old.ended_at for i in (intent, reverse)
        )
        assert session.get(ExchangeIntent, intent).accepted_proposal_id == new_id
        parties = session.scalars(
            select(TradeParticipant).where(TradeParticipant.proposal_id == new_id)
        ).all()
        assert {p.participant_id: p.response for p in parties} == {
            sender.id: "pending",
            owner: "consented",
        }


def test_accept_visibility_and_owner_permission(client, db, exchange):
    event, _, sender, foreign, _, intent = exchange
    _, outsider = add_participant(db, event["event"]["id"], "Outsider")
    assert_error(action(client, intent, sender), 403, "FORBIDDEN")
    for token in (outsider, foreign["participantToken"]):
        assert_error(action(client, intent, token), 404, "NOT_FOUND")
    assert_error(action(client, str(uuid4()), event["participantToken"]), 404, "NOT_FOUND")


@pytest.mark.parametrize("status", ["withdrawn", "declined", "invalidated"])
def test_accept_rejects_inactive_intent(client, db, exchange, status):
    event, _, _, _, _, intent = exchange
    with db.write() as session:
        session.get(ExchangeIntent, intent).status = status
    assert_error(action(client, intent, event["participantToken"]), 409, "INTENT_NOT_ACTIVE")


@pytest.mark.parametrize(
    "status,code",
    [("confirmed", "CLOTHING_ALREADY_CONFIRMED"), ("withdrawn", "CLOTHING_NOT_AVAILABLE")],
)
@pytest.mark.parametrize("garment", ["mine_available", "other_available"])
def test_accept_rejects_unavailable_garment(client, db, exchange, status, code, garment):
    event, _, _, _, rows, intent = exchange
    clothing_id = rows[garment]["id"]
    with db.write() as session:
        session.get(Clothing, clothing_id).status = status
    error = assert_error(action(client, intent, event["participantToken"]), 409, code)
    assert error["details"]["clothingId"] == clothing_id


def test_accept_closed_event_precedes_inactive_check(client, db, exchange):
    event, _, _, _, _, intent = exchange
    with db.write() as session:
        session.get(ExchangeIntent, intent).status = "withdrawn"
    close_event(db, event["event"]["id"], datetime.now(UTC))
    assert_error(action(client, intent, event["participantToken"]), 409, "EVENT_CLOSED")


def test_accept_confirms_when_sender_already_consented(client, db, exchange):
    event, sender, _, _, rows, intent = exchange
    offered = rows["mine_available"]["id"]
    wanted = rows["other_available"]["id"]
    alternative = rows["other_withdrawn"]["id"]
    owner = event["event"]["organizerParticipantId"]
    proposal = seed_proposal(db, exchange, "pending", sender_response="consented")
    competing, now = str(uuid4()), datetime.now(UTC)
    with db.write() as session:
        session.get(ExchangeIntent, intent).accepted_proposal_id = None
        session.get(Clothing, alternative).status = "available"
        session.add(
            TradeProposal(
                id=competing,
                event_id=event["event"]["id"],
                version=1,
                status="pending",
                cycle_key=cycle_key(
                    [(sender.id, offered, alternative), (owner, alternative, offered)]
                ),
                created_at=now,
            )
        )
        session.flush()
        for participant, give, receive in (
            (sender.id, offered, alternative),
            (owner, alternative, offered),
        ):
            session.add(
                TradeParticipant(
                    id=str(uuid4()),
                    proposal_id=competing,
                    participant_id=participant,
                    offered_clothing_id=give,
                    received_clothing_id=receive,
                    offered_content_version=1,
                    response="pending",
                    is_confirmed=False,
                )
            )

    response = action(client, intent, event["participantToken"])
    assert response.status_code == 200
    assert (response.json()["id"], response.json()["status"]) == (proposal, "confirmed")
    with db.read() as session:
        assert all(
            session.get(Clothing, garment).status == "confirmed" for garment in (offered, wanted)
        )
        parties = session.scalars(
            select(TradeParticipant).where(TradeParticipant.proposal_id == proposal)
        ).all()
        assert len(parties) == 2 and all(p.is_confirmed for p in parties)
        other = session.get(TradeProposal, competing)
        assert (other.status, other.end_reason) == ("invalidated", "clothing_confirmed_elsewhere")
        assert other.ended_at is not None
