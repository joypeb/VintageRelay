from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Event

import pytest
from sqlalchemy import select

from app.models.clothing import Clothing
from app.models.event import Event as EventModel
from app.models.trade_participant import TradeParticipant
from app.models.trade_proposal import TradeProposal
from tests.api.test_intents_register_list import assert_error
from tests.api.test_proposals_consent_conflicts import proposal_action

pytest_plugins = ("tests.api.test_proposals_consent_conflicts",)


@pytest.mark.parametrize("first", ["close", "consent"])
def test_close_and_final_consent_serialize_on_separate_connections(client, db, accepted, first):
    (event, _, token, _, rows, _), proposal = accepted
    event_id = event["event"]["id"]
    started = Event()

    def consent():
        started.set()
        return proposal_action(client, proposal, token)

    if first == "close":
        with ThreadPoolExecutor(max_workers=1) as pool:
            with db.write() as session:
                row = session.get(EventModel, event_id)
                row.status, row.closed_at = "closed", datetime.now(UTC)
                session.flush()
                future = pool.submit(consent)
                assert started.wait(timeout=5)
            response = future.result(timeout=10)
        assert_error(response, 409, "EVENT_CLOSED")
    else:
        response = consent()
        assert response.status_code == 200 and response.json()["status"] == "confirmed"
        close = client.post(
            f"/api/v1/events/{event_id}/close",
            headers={"Authorization": f"Bearer {event['participantToken']}"},
        )
        assert close.status_code == 200
    with db.read() as session:
        row = session.get(TradeProposal, proposal)
        assert row.status in (("pending", "invalidated") if first == "close" else ("confirmed",))
        parts = session.scalars(
            select(TradeParticipant).where(TradeParticipant.proposal_id == proposal)
        ).all()
        assert all(p.is_confirmed == (first == "consent") for p in parts)
        assert all(
            session.get(Clothing, rows[key]["id"]).status
            == ("available" if first == "close" else "confirmed")
            for key in ("mine_available", "other_available")
        )
