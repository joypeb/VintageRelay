import pytest
from sqlalchemy import select

from app.domain.matching import cycle_key
from app.models.clothing import Clothing
from app.models.trade_participant import TradeParticipant
from app.models.trade_proposal import TradeProposal
from tests.api.test_intents_accept import action
from tests.api.test_intents_register_list import auth, post, seed_intent
from tests.api.test_proposals_consent_conflicts import proposal_action
from tests.conftest import add_participant


@pytest.fixture
def three_people(client, db, registration_context):
    event, participant, token, _, upload = registration_context
    event_id = event["event"]["id"]
    third, third_token = add_participant(db, event_id, "Alex")
    people = [
        (participant.id, token),
        (event["event"]["organizerParticipantId"], event["participantToken"]),
        (third.id, third_token),
    ]
    clothes = []
    for _, person_token in people:
        photo = upload(event_id, person_token)
        response = client.post(
            f"/api/v1/events/{event_id}/clothing",
            headers=auth(person_token),
            json={
                "photoIds": [photo["id"]],
                "category": "top",
                "title": "Jacket",
                "description": "Jacket",
            },
        )
        assert response.status_code == 201
        clothes.append(response.json()["id"])
    legs = [(people[i][0], clothes[i], clothes[(i + 1) % 3]) for i in range(3)]
    return event_id, people, clothes, legs


def close_loop(client, db, context, last=2):
    event_id, people, _, legs = context
    for i in range(3):
        if i != last:
            seed_intent(db, event_id, *legs[i], age=5)
    response = post(client, event_id, people[last][1], legs[last][1], legs[last][2])
    assert response.status_code == 201
    return response.json()["id"]


def proposals(db, legs):
    with db.read() as session:
        return list(
            session.scalars(select(TradeProposal).where(TradeProposal.cycle_key == cycle_key(legs)))
        )


@pytest.mark.parametrize("last", [0, 1, 2])
def test_loop_closure_creates_one_pending_proposal_with_all_legs(client, db, three_people, last):
    _, people, _, legs = three_people
    close_loop(client, db, three_people, last)
    found = proposals(db, legs)
    assert len(found) == 1
    assert (found[0].status, found[0].version) == ("pending", 1)
    response = client.get(f"/api/v1/proposals/{found[0].id}", headers=auth(people[0][1]))
    assert response.status_code == 200
    body = response.json()
    assert body["cycleSize"] == 3
    assert {
        (p["participant"]["participantId"], p["offeredClothing"]["id"], p["receivedClothing"]["id"])
        for p in body["participants"]
    } == set(legs)


def test_three_consents_confirm_all_garments(client, db, three_people):
    _, people, clothes, legs = three_people
    close_loop(client, db, three_people)
    proposal = proposals(db, legs)[0]
    for index, (_, token) in enumerate(people):
        response = proposal_action(client, proposal.id, token)
        assert response.status_code == 200
        assert response.json()["status"] == ("confirmed" if index == 2 else "pending")
    with db.read() as session:
        assert all(session.get(Clothing, garment).status == "confirmed" for garment in clothes)
        parties = session.scalars(
            select(TradeParticipant).where(TradeParticipant.proposal_id == proposal.id)
        ).all()
        assert len(parties) == 3 and all(
            p.response == "consented" and p.is_confirmed for p in parties
        )


def test_rejection_suppresses_replay_until_intent_is_recreated(client, db, three_people):
    event_id, people, _, legs = three_people
    intent = close_loop(client, db, three_people)
    original = proposals(db, legs)[0]
    response = proposal_action(client, original.id, people[0][1], "reject")
    assert response.status_code == 200 and response.json()["status"] == "rejected"
    replay = post(client, event_id, people[2][1], legs[2][1], legs[2][2])
    assert replay.status_code == 200 and replay.json()["id"] == intent
    assert len(proposals(db, legs)) == 1
    response = client.delete(f"/api/v1/intents/{intent}", headers=auth(people[2][1]))
    assert response.status_code in (200, 204)
    response = post(client, event_id, people[2][1], legs[2][1], legs[2][2])
    assert response.status_code == 201
    found = proposals(db, legs)
    assert sorted((p.version, p.status) for p in found) == [(1, "rejected"), (2, "pending")]


def test_accept_closes_three_person_loop_and_reuses_pending_on_other_accept(
    client, db, three_people
):
    event_id, people, clothes, legs = three_people
    seed_intent(db, event_id, *legs[0], age=5)
    middle = seed_intent(db, event_id, *legs[1], age=5)
    incoming = seed_intent(db, event_id, people[0][0], clothes[0], clothes[2], age=5)
    response = action(client, incoming, people[2][1])
    assert response.status_code == 200 and response.json()["cycleSize"] == 2
    found = proposals(db, legs)
    assert len(found) == 1 and found[0].status == "pending"
    proposal_id = found[0].id
    response = action(client, middle, people[2][1])
    assert response.status_code == 200
    found = proposals(db, legs)
    assert len(found) == 1 and found[0].id == proposal_id


def test_accept_reuses_existing_three_person_pending_proposal(client, db, three_people):
    _, people, _, legs = three_people
    close_loop(client, db, three_people)
    original = proposals(db, legs)[0]
    with db.read() as session:
        from app.models.exchange_intent import ExchangeIntent

        intent = session.scalar(
            select(ExchangeIntent).where(
                ExchangeIntent.offered_clothing_id == legs[0][1],
                ExchangeIntent.wanted_clothing_id == legs[0][2],
            )
        ).id
    response = action(client, intent, people[1][1])
    assert response.status_code == 200
    found = proposals(db, legs)
    assert len(found) == 1 and found[0].id == original.id
