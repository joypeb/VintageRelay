import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Barrier, Event
from uuid import uuid4

import pytest
from sqlalchemy import select

import app.services.proposal as proposal_service
from app.models.clothing import Clothing
from app.models.event import Event as EventModel
from app.models.trade_participant import TradeParticipant
from app.models.trade_proposal import TradeProposal
from tests.api.test_intents_register_list import assert_error, auth, post, seed_intent
from tests.api.test_proposals_consent_conflicts import proposal_action
from tests.api.test_proposals_three_person import close_loop, proposals
from tests.conftest import add_participant, close_event

pytest_plugins = (
    "tests.api.test_proposals_consent_conflicts",
    "tests.api.test_proposals_three_person",
)


def cancel(client, proposal, token):
    return client.post(f"/api/v1/proposals/{proposal}/cancel", headers=auth(token))


@pytest.fixture
def confirmed(client, accepted):
    exchange, proposal = accepted
    response = proposal_action(client, proposal, exchange[2])
    assert response.status_code == 200 and response.json()["status"] == "confirmed"
    return exchange, proposal


def check_state(db, proposal, clothes, proposal_status, clothing_status, is_confirmed):
    with db.read() as session:
        assert session.get(TradeProposal, proposal).status == proposal_status
        parties = session.scalars(
            select(TradeParticipant).where(TradeParticipant.proposal_id == proposal)
        ).all()
        assert len(parties) == len(clothes) and all(p.is_confirmed is is_confirmed for p in parties)
        assert all(session.get(Clothing, item).status == clothing_status for item in clothes)


def garments(rows):
    return [rows[key]["id"] for key in ("mine_available", "other_available")]


def test_cancel_confirmed_releases_garments(client, db, confirmed):
    (_, _, token, _, rows, _), proposal = confirmed
    response = cancel(client, proposal, token)
    assert response.status_code == 200
    body = response.json()
    assert (body["id"], body["status"], body["endReason"], body["canCancel"]) == (
        proposal,
        "cancelled",
        "participant_cancelled",
        False,
    )
    assert body["cancelledAt"] and body["cancelledAt"] == body["endedAt"]
    check_state(db, proposal, garments(rows), "cancelled", "available", False)
    with db.read() as session:
        row = session.get(TradeProposal, proposal)
        assert row.cancelled_at == row.ended_at and row.cancelled_at is not None


def test_cancel_three_person_exchange(client, db, three_people):
    _, people, clothes, legs = three_people
    close_loop(client, db, three_people)
    proposal = proposals(db, legs)[0].id
    for _, token in people:
        assert proposal_action(client, proposal, token).status_code == 200
    response = cancel(client, proposal, people[0][1])
    assert response.status_code == 200 and response.json()["status"] == "cancelled"
    check_state(db, proposal, clothes, "cancelled", "available", False)


def test_replay_by_both_parties_and_after_closure(client, db, confirmed):
    (event, _, token, _, rows, _), proposal = confirmed
    first = cancel(client, proposal, token)
    assert first.status_code == 200
    body = first.json()
    keys = ("id", "status", "endReason", "cancelledAt", "endedAt")
    for actor in (token, event["participantToken"]):
        replay = cancel(client, proposal, actor)
        assert replay.status_code == 200
        assert {k: replay.json()[k] for k in keys} == {k: body[k] for k in keys}
    close_event(db, event["event"]["id"], datetime.now(UTC))
    replay = cancel(client, proposal, event["participantToken"])
    assert replay.status_code == 200 and replay.json()["cancelledAt"] == body["cancelledAt"]
    check_state(db, proposal, garments(rows), "cancelled", "available", False)
    with db.read() as session:
        assert len(session.scalars(select(TradeProposal)).all()) == 1


def test_cancel_after_close_is_refused(client, db, confirmed):
    (event, _, token, _, rows, _), proposal = confirmed
    close_event(db, event["event"]["id"], datetime.now(UTC))
    error = assert_error(cancel(client, proposal, token), 409, "EVENT_CLOSED")
    assert error["message"] == "This event is closed, so exchanges can no longer be cancelled."
    check_state(db, proposal, garments(rows), "confirmed", "confirmed", True)


@pytest.mark.parametrize("status", ["pending", "rejected", "invalidated"])
def test_cancel_nonconfirmed_is_refused(client, db, accepted, status):
    (_, _, token, _, _, _), proposal = accepted
    with db.write() as session:
        session.get(TradeProposal, proposal).status = status
    assert_error(cancel(client, proposal, token), 409, "PROPOSAL_NOT_CONFIRMED")


def test_cancel_hides_proposal_and_requires_authentication(client, db, confirmed):
    (event, _, token, foreign, _, _), proposal = confirmed
    _, outsider = add_participant(db, event["event"]["id"], "Outsider")
    for actor, target in (
        (outsider, proposal),
        (foreign["participantToken"], proposal),
        (token, str(uuid4())),
    ):
        assert_error(cancel(client, target, actor), 404, "NOT_FOUND")
    assert_error(client.post(f"/api/v1/proposals/{proposal}/cancel"), 401, "UNAUTHENTICATED")


def test_cancel_suppresses_unchanged_cycle(client, db, confirmed):
    (_, _, token, _, _, _), proposal = confirmed
    assert cancel(client, proposal, token).status_code == 200
    with db.read() as session:
        original = session.get(TradeProposal, proposal)
        found = session.scalars(
            select(TradeProposal).where(TradeProposal.cycle_key == original.cycle_key)
        ).all()
        assert [(p.id, p.status) for p in found] == [(proposal, "cancelled")]


def test_new_intent_can_form_cycle_with_freed_garment(client, db, confirmed):
    (event, _, token, _, rows, _), proposal = confirmed
    event_id = event["event"]["id"]
    mine, alternative = rows["mine_available"]["id"], rows["other_withdrawn"]["id"]
    with db.write() as session:
        session.get(Clothing, alternative).status = "available"
    seed_intent(db, event_id, event["event"]["organizerParticipantId"], alternative, mine)
    assert cancel(client, proposal, token).status_code == 200
    response = post(client, event_id, token, mine, alternative)
    assert response.status_code == 201
    with db.read() as session:
        pending = session.scalars(
            select(TradeProposal).where(TradeProposal.status == "pending")
        ).all()
        assert len(pending) == 1
        parties = session.scalars(
            select(TradeParticipant).where(TradeParticipant.proposal_id == pending[0].id)
        ).all()
        assert {p.offered_clothing_id for p in parties} == {mine, alternative}


def test_cancel_logs_once_on_replay(client, caplog, confirmed):
    (event, sender, token, _, _, _), proposal = confirmed
    caplog.set_level(logging.INFO)
    assert cancel(client, proposal, token).status_code == 200
    assert cancel(client, proposal, event["participantToken"]).status_code == 200
    records = [r for r in caplog.records if r.getMessage() == "proposal_cancelled"]
    assert len(records) == 1
    assert records[0].proposal_id == proposal and records[0].cancelled_by == sender.id


def test_concurrent_cancels_apply_once(client, db, caplog, confirmed):
    (event, _, token, _, rows, _), proposal = confirmed
    caplog.set_level(logging.INFO)
    barrier = Barrier(2)

    def send(actor):
        barrier.wait(timeout=5)
        return cancel(client, proposal, actor)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(send, (token, event["participantToken"])))
    assert all(r.status_code == 200 and r.json()["status"] == "cancelled" for r in responses)
    assert responses[0].json()["cancelledAt"] == responses[1].json()["cancelledAt"]
    assert len([r for r in caplog.records if r.getMessage() == "proposal_cancelled"]) == 1
    check_state(db, proposal, garments(rows), "cancelled", "available", False)


@pytest.mark.parametrize("first", ["close", "cancel"])
def test_close_and_cancel_are_serialized(client, db, confirmed, first):
    (event, _, token, _, rows, _), proposal = confirmed
    event_id = event["event"]["id"]
    if first == "close":
        started = Event()

        def send():
            started.set()
            return cancel(client, proposal, token)

        with ThreadPoolExecutor(max_workers=1) as pool:
            with db.write() as session:
                row = session.get(EventModel, event_id)
                row.status, row.closed_at = "closed", datetime.now(UTC)
                session.flush()
                future = pool.submit(send)
                assert started.wait(timeout=5)
            response = future.result(timeout=10)
        assert_error(response, 409, "EVENT_CLOSED")
        check_state(db, proposal, garments(rows), "confirmed", "confirmed", True)
    else:
        assert cancel(client, proposal, token).status_code == 200
        response = client.post(
            f"/api/v1/events/{event_id}/close", headers=auth(event["participantToken"])
        )
        assert response.status_code == 200
        check_state(db, proposal, garments(rows), "cancelled", "available", False)


def test_cancel_rolls_back_when_recalculation_fails(client_no_raise, db, confirmed, monkeypatch):
    (_, _, token, _, rows, _), proposal = confirmed

    def fail(*args, **kwargs):
        raise RuntimeError("recalculation failed")

    monkeypatch.setattr(proposal_service, "_recalculate_cycles_for_clothing", fail, raising=False)
    assert_error(cancel(client_no_raise, proposal, token), 500, "INTERNAL_ERROR")
    check_state(db, proposal, garments(rows), "confirmed", "confirmed", True)


def test_recreated_intent_lifts_cancel_suppression(client, db, confirmed):
    (event, _, token, _, rows, intent), proposal = confirmed
    assert cancel(client, proposal, token).status_code == 200
    assert client.delete(f"/api/v1/intents/{intent}", headers=auth(token)).status_code in (200, 204)
    response = post(
        client,
        event["event"]["id"],
        token,
        rows["mine_available"]["id"],
        rows["other_available"]["id"],
    )
    assert response.status_code == 201
    with db.read() as session:
        original = session.get(TradeProposal, proposal)
        found = session.scalars(
            select(TradeProposal).where(TradeProposal.cycle_key == original.cycle_key)
        ).all()
        assert sorted((p.version, p.status) for p in found) == [(1, "cancelled"), (2, "pending")]


def test_garment_edit_lifts_cancel_suppression(client, db, confirmed):
    (_, _, token, _, rows, _), proposal = confirmed
    assert cancel(client, proposal, token).status_code == 200
    response = client.patch(
        f"/api/v1/clothing/{rows['mine_available']['id']}",
        headers=auth(token),
        json={"title": "Updated jacket"},
    )
    assert response.status_code == 200 and response.json()["contentVersion"] == 2
    with db.read() as session:
        original = session.get(TradeProposal, proposal)
        found = session.scalars(
            select(TradeProposal).where(TradeProposal.cycle_key == original.cycle_key)
        ).all()
        assert sorted((p.version, p.status) for p in found) == [(1, "cancelled"), (2, "pending")]


def test_cancel_openapi_operation_id(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert (
        paths.get("/api/v1/proposals/{proposal_id}/cancel", {}).get("post", {}).get("operationId")
        == "cancelProposal"
    )
