import pytest
from sqlalchemy import select

from app.models.exchange_intent import ExchangeIntent
from app.models.trade_participant import TradeParticipant
from app.models.trade_proposal import TradeProposal
from tests.api.test_intents_accept import action
from tests.api.test_intents_register_list import assert_error, auth, post
from tests.api.test_proposals_consent_conflicts import proposal_action
from tests.conftest import add_participant

pytest_plugins = ("tests.api.test_proposals_consent_conflicts",)


def close(client, event):
    return client.post(
        f"/api/v1/events/{event['event']['id']}/close", headers=auth(event["participantToken"])
    )


def test_edit_invalidates_and_reproposes_without_reusing_consent(client, db, accepted):
    (event, _, token, _, rows, _), old_id = accepted
    response = client.patch(
        f"/api/v1/clothing/{rows['mine_available']['id']}",
        headers=auth(token),
        json={"title": "Updated garment"},
    )
    assert response.status_code == 200
    with db.read() as session:
        old = session.get(TradeProposal, old_id)
        assert (old.status, old.end_reason) == ("invalidated", "clothing_changed")
        assert old.ended_at is not None
        new = session.scalars(
            select(TradeProposal).where(
                TradeProposal.cycle_key == old.cycle_key, TradeProposal.id != old_id
            )
        ).one()
        assert (new.status, new.version) == ("pending", old.version + 1)
        new_id, version = new.id, new.version
        parties = session.scalars(
            select(TradeParticipant).where(TradeParticipant.proposal_id == new_id)
        ).all()
        assert len(parties) == 2 and all(
            p.response == "pending" and not p.is_confirmed for p in parties
        )
        assert all(i.status == "active" for i in session.scalars(select(ExchangeIntent)).all())
    assert_error(
        proposal_action(client, old_id, event["participantToken"]), 409, "PROPOSAL_VERSION_MISMATCH"
    )
    first = proposal_action(client, new_id, token, version=version)
    assert first.status_code == 200 and first.json()["status"] == "pending"
    second = proposal_action(client, new_id, event["participantToken"], version=version)
    assert second.status_code == 200 and second.json()["status"] == "confirmed"


def test_withdraw_invalidates_offering_and_wanted_intents_and_pending(client, db, accepted):
    (_, _, token, _, rows, _), proposal_id = accepted
    response = client.delete(
        f"/api/v1/clothing/{rows['mine_available']['id']}", headers=auth(token)
    )
    assert response.status_code == 204
    with db.read() as session:
        intents = session.scalars(select(ExchangeIntent)).all()
        assert len(intents) == 2 and all(i.status == "invalidated" for i in intents)
        proposal = session.get(TradeProposal, proposal_id)
        assert (proposal.status, proposal.end_reason) == ("invalidated", "clothing_withdrawn")
        assert proposal.ended_at is not None


def test_close_invalidates_pending_proposal(client, db, accepted):
    (event, _, token, _, _, _), proposal_id = accepted
    assert close(client, event).status_code == 200
    with db.read() as session:
        proposal = session.get(TradeProposal, proposal_id)
        assert (proposal.status, proposal.end_reason) == ("invalidated", "event_closed")
        assert proposal.ended_at is not None
    assert_error(proposal_action(client, proposal_id, token), 409, "EVENT_CLOSED")
    assert_error(
        proposal_action(client, proposal_id, event["participantToken"]), 409, "EVENT_CLOSED"
    )


def test_close_keeps_confirmed_proposal_and_confirmed_flags(client, db, accepted):
    (event, _, token, _, _, _), proposal_id = accepted
    assert proposal_action(client, proposal_id, token).json()["status"] == "confirmed"
    assert close(client, event).status_code == 200
    with db.read() as session:
        assert session.get(TradeProposal, proposal_id).status == "confirmed"
        parties = session.scalars(
            select(TradeParticipant).where(TradeParticipant.proposal_id == proposal_id)
        ).all()
        assert len(parties) == 2 and all(p.is_confirmed for p in parties)
    assert proposal_action(client, proposal_id, token).status_code == 200


def test_retrofit_permission_matrix(client, db, accepted):
    (event, _, token, foreign, rows, _), _ = accepted
    garment = rows["mine_available"]["id"]
    _, outsider = add_participant(db, event["event"]["id"], "Outsider")
    for viewer in (event["participantToken"], outsider):
        assert_error(
            client.patch(
                f"/api/v1/clothing/{garment}", headers=auth(viewer), json={"title": "Changed"}
            ),
            403,
            "FORBIDDEN",
        )
        assert_error(
            client.delete(f"/api/v1/clothing/{garment}", headers=auth(viewer)), 403, "FORBIDDEN"
        )
    assert_error(
        client.delete(f"/api/v1/clothing/{garment}", headers=auth(foreign["participantToken"])),
        404,
        "NOT_FOUND",
    )
    for viewer, status, code in (
        (token, 403, "FORBIDDEN"),
        (foreign["participantToken"], 404, "NOT_FOUND"),
    ):
        assert_error(
            client.post(f"/api/v1/events/{event['event']['id']}/close", headers=auth(viewer)),
            status,
            code,
        )


@pytest.mark.parametrize(
    "operation",
    [
        "edit",
        "withdraw_clothing",
        "register",
        "accept",
        "decline",
        "withdraw_intent",
        "consent",
        "reject",
    ],
)
def test_close_rejects_new_mutations(client, accepted, operation):
    (event, _, token, _, rows, intent), proposal_id = accepted
    assert close(client, event).status_code == 200
    garment = rows["mine_available"]["id"]
    requests = {
        "edit": lambda: client.patch(
            f"/api/v1/clothing/{garment}", headers=auth(token), json={"title": "Changed"}
        ),
        "withdraw_clothing": lambda: client.delete(
            f"/api/v1/clothing/{garment}", headers=auth(token)
        ),
        "register": lambda: post(
            client, event["event"]["id"], token, garment, rows["other_confirmed"]["id"]
        ),
        "accept": lambda: action(client, intent, event["participantToken"]),
        "decline": lambda: action(client, intent, event["participantToken"], "decline"),
        "withdraw_intent": lambda: client.delete(f"/api/v1/intents/{intent}", headers=auth(token)),
        "consent": lambda: proposal_action(client, proposal_id, token),
        "reject": lambda: proposal_action(client, proposal_id, token, "reject"),
    }
    assert_error(requests[operation](), 409, "EVENT_CLOSED")


def test_close_allows_completed_withdrawal_and_close_replays(client, accepted):
    (event, _, token, _, rows, intent), _ = accepted
    garment = rows["mine_withdrawn"]["id"]
    assert client.delete(f"/api/v1/intents/{intent}", headers=auth(token)).status_code == 204
    first = close(client, event)
    assert first.status_code == 200
    replay = close(client, event)
    assert replay.status_code == 200 and replay.json() == first.json()
    assert client.delete(f"/api/v1/clothing/{garment}", headers=auth(token)).status_code == 204
    assert client.delete(f"/api/v1/intents/{intent}", headers=auth(token)).status_code == 204
