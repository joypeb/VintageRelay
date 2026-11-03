from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select, update

from app.models.clothing import Clothing
from app.models.exchange_intent import ExchangeIntent
from tests.conftest import add_participant, close_event

pytest_plugins = ("tests.api.test_list_clothing",)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def assert_error(response, status, code):
    assert response.status_code == status
    error = response.json()["error"]
    assert error["code"] == code
    assert error["requestId"] == response.headers["X-Request-ID"]
    return error


def seed_intent(db, event_id, participant_id, offered, wanted, status="active", age=0):
    now = datetime.now(UTC) - timedelta(minutes=age)
    intent_id = str(uuid4())
    with db.write() as session:
        session.add(
            ExchangeIntent(
                id=intent_id,
                event_id=event_id,
                participant_id=participant_id,
                offered_clothing_id=offered,
                wanted_clothing_id=wanted,
                status=status,
                accepted_proposal_id=None,
                created_at=now,
                updated_at=now,
            )
        )
    return intent_id


def post(client, event_id, token, offered, wanted):
    return client.post(
        f"/api/v1/events/{event_id}/intents",
        headers=auth(token),
        json={"offeredClothingId": offered, "wantedClothingId": wanted},
    )


def test_register_creates_and_replays_same_pair_even_after_closure(client, db, list_context):
    event, participant, token, _, rows = list_context
    event_id = event["event"]["id"]
    offered, wanted = rows["mine_available"]["id"], rows["other_available"]["id"]
    first = post(client, event_id, token, offered, wanted)
    assert first.status_code == 201
    body = first.json()
    assert body["participantId"] == participant.id
    assert body["offeredClothing"]["id"] == offered
    assert body["wantedClothing"]["id"] == wanted
    assert body["status"] == "active" and body["acceptedProposalId"] is None
    close_event(db, event_id, datetime.now(UTC))
    replay = post(client, event_id, token, offered, wanted)
    assert replay.status_code == 200
    assert replay.json() == body
    with db.read() as session:
        assert session.scalar(select(func.count()).select_from(ExchangeIntent)) == 1


@pytest.mark.parametrize(
    ("offered", "wanted", "status", "code"),
    [
        ("other_available", "mine_available", 403, "FORBIDDEN"),
        ("mine_available", "foreign", 404, "NOT_FOUND"),
        ("mine_available", "mine_confirmed", 422, "VALIDATION_ERROR"),
        ("mine_confirmed", "other_available", 409, "CLOTHING_ALREADY_CONFIRMED"),
        ("mine_available", "other_withdrawn", 409, "CLOTHING_NOT_AVAILABLE"),
    ],
)
def test_register_validates_pair(client, list_context, offered, wanted, status, code):
    event, _, token, _, rows = list_context
    response = post(client, event["event"]["id"], token, rows[offered]["id"], rows[wanted]["id"])
    error = assert_error(response, status, code)
    if status == 422:
        assert {"field": "wantedClothingId", "reason": "own_clothing"} in error["details"]["fields"]
    if status == 409:
        assert (
            error["details"]["clothingId"]
            == rows[offered if offered == "mine_confirmed" else wanted]["id"]
        )


def test_register_check_order_and_closed_event(client, db, list_context):
    event, _, token, _, rows = list_context
    event_id = event["event"]["id"]
    close_event(db, event_id, datetime.now(UTC))

    def send(offered, wanted):
        return post(client, event_id, token, rows[offered]["id"], rows[wanted]["id"])

    assert_error(send("other_available", "foreign"), 404, "NOT_FOUND")
    assert_error(send("other_available", "mine_available"), 403, "FORBIDDEN")
    assert_error(send("mine_available", "mine_confirmed"), 422, "VALIDATION_ERROR")
    assert_error(send("mine_confirmed", "other_available"), 409, "EVENT_CLOSED")


def test_register_replay_precedes_garment_state_check(client, db, list_context):
    event, participant, token, _, rows = list_context
    event_id = event["event"]["id"]
    offered, wanted = rows["mine_available"]["id"], rows["other_available"]["id"]
    intent_id = seed_intent(db, event_id, participant.id, offered, wanted)
    with db.write() as session:
        session.execute(update(Clothing).where(Clothing.id == offered).values(status="confirmed"))
    response = post(client, event_id, token, offered, wanted)
    assert response.status_code == 200
    assert response.json()["id"] == intent_id


def test_list_direction_status_wanted_filter_and_visibility(client, db, list_context):
    event, participant, token, _, rows = list_context
    event_id = event["event"]["id"]
    owner_token = event["participantToken"]
    _, outsider_token = add_participant(db, event_id, "Outsider")
    own = rows["mine_available"]["id"]
    want = rows["other_available"]["id"]
    other_want = rows["other_confirmed"]["id"]
    active = seed_intent(db, event_id, participant.id, own, want, age=1)
    withdrawn = seed_intent(db, event_id, participant.id, own, other_want, "withdrawn", age=2)
    newer = seed_intent(db, event_id, participant.id, own, other_want, age=0)
    url = f"/api/v1/events/{event_id}/intents"

    def ids(viewer, params=None):
        response = client.get(url, headers=auth(viewer), params=params)
        assert response.status_code == 200
        assert response.json()["nextCursor"] is None
        return [item["id"] for item in response.json()["items"]]

    assert ids(token) == [newer, active]
    assert ids(owner_token, {"direction": "received"}) == [newer, active]
    assert ids(outsider_token, {"direction": "received"}) == []
    assert ids(
        token, [("status", "withdrawn"), ("status", "active"), ("wantedClothingId", other_want)]
    ) == [newer, withdrawn]
    assert ids(owner_token, {"direction": "received", "wantedClothingId": want}) == [active]


@pytest.mark.parametrize("field", ["direction", "status"])
def test_list_rejects_invalid_filters(client, list_context, field):
    event, _, token, _, _ = list_context
    response = client.get(
        f"/api/v1/events/{event['event']['id']}/intents",
        headers=auth(token),
        params={field: "invalid"},
    )
    assert_error(response, 422, "VALIDATION_ERROR")
