from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.domain.errors import NotFoundError
from app.models.clothing import Clothing
from app.models.photo import Photo
from tests.conftest import close_event


def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def list_context(db, registration_context):
    event, participant, token, create_event, _ = registration_context
    foreign = create_event("Foreign")
    event_id = event["event"]["id"]
    now = datetime(2026, 10, 30, 12, tzinfo=UTC)
    owner = event["event"]["organizerParticipantId"]
    rows = {}
    with db.write() as session:
        for index, (name, target_event, target_owner, status, age) in enumerate(
            [
                ("mine_available", event_id, participant.id, "available", 0),
                ("mine_confirmed", event_id, participant.id, "confirmed", 0),
                ("mine_withdrawn", event_id, participant.id, "withdrawn", 1),
                ("other_available", event_id, owner, "available", 1),
                ("other_confirmed", event_id, owner, "confirmed", 2),
                ("other_withdrawn", event_id, owner, "withdrawn", 3),
                (
                    "foreign",
                    foreign["event"]["id"],
                    foreign["event"]["organizerParticipantId"],
                    "available",
                    0,
                ),
            ],
            1,
        ):
            photo_id = str(uuid4())
            created_at = now - timedelta(hours=age)
            clothing_id = f"00000000-0000-4000-8000-{index:012d}"
            session.add(
                Photo(
                    id=photo_id,
                    event_id=target_event,
                    uploader_id=target_owner,
                    storage_location=f"{photo_id}.jpg",
                    content_type="image/jpeg",
                    size_bytes=123,
                    created_at=created_at,
                    clothing_id=None,
                    position=None,
                )
            )
            session.flush()
            session.add(
                Clothing(
                    id=clothing_id,
                    event_id=target_event,
                    owner_id=target_owner,
                    title=name,
                    category="top" if index == 1 else "other",
                    description=name,
                    measure_total_length=None,
                    measure_chest=21.0 if index == 1 else None,
                    measure_shoulder=18.5 if index == 1 else None,
                    measure_sleeve=None,
                    measure_waist=None,
                    measure_hem=None,
                    measure_inseam=None,
                    measure_thigh=None,
                    status=status,
                    content_version=1,
                    created_at=created_at,
                    updated_at=created_at,
                )
            )
            session.flush()
            photo = session.get(Photo, photo_id)
            photo.clothing_id = clothing_id
            photo.position = 0
            rows[name] = {
                "id": clothing_id,
                "photo_id": photo_id,
                "status": status,
                "created_at": created_at,
                "category": "top" if index == 1 else "other",
                "measurements": (
                    {
                        "totalLength": None,
                        "chest": 21.0,
                        "shoulder": 18.5,
                        "sleeve": None,
                        "waist": None,
                        "hem": None,
                        "inseam": None,
                        "thigh": None,
                    }
                    if index == 1
                    else None
                ),
            }
    return event, participant, token, foreign, rows


def get_list(client, event_id, token, params=None):
    return client.get(f"/api/v1/events/{event_id}/clothing", headers=headers(token), params=params)


def assert_items(response, expected, rows, event_id, participant, organizer_id, settings):
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"items", "nextCursor"}
    assert body["nextCursor"] is None
    assert [item["id"] for item in body["items"]] == [rows[name]["id"] for name in expected]
    for item, name in zip(body["items"], expected, strict=True):
        own = name.startswith("mine_")
        assert set(item) == {
            "id",
            "eventId",
            "owner",
            "isMine",
            "photos",
            "category",
            "title",
            "description",
            "measurements",
            "status",
            "contentVersion",
            "analysis",
            "createdAt",
            "updatedAt",
        }
        assert item["eventId"] == event_id
        assert item["owner"] == {
            "participantId": participant.id if own else organizer_id,
            "displayName": "Joon" if own else "Mina",
            "isOrganizer": not own,
        }
        assert item["isMine"] is own
        assert item["photos"][0] == {
            "id": rows[name]["photo_id"],
            "url": f"{settings.app_base_url}/api/v1/photos/{rows[name]['photo_id']}",
        }
        assert item["description"] == name
        assert item["title"] == name
        assert item["category"] == rows[name]["category"]
        assert item["measurements"] == rows[name]["measurements"]
        assert item["status"] == rows[name]["status"]
        assert item["contentVersion"] == 1 and item["analysis"] is None
        assert datetime.fromisoformat(item["createdAt"]) == rows[name]["created_at"]
        assert item["updatedAt"] == item["createdAt"]


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"ownership": "mine"}, ["mine_confirmed", "mine_available", "mine_withdrawn"]),
        ({"ownership": "others"}, ["other_available", "other_confirmed"]),
        (
            None,
            [
                "mine_confirmed",
                "mine_available",
                "other_available",
                "mine_withdrawn",
                "other_confirmed",
            ],
        ),
        (
            {"ownership": "all"},
            [
                "mine_confirmed",
                "mine_available",
                "other_available",
                "mine_withdrawn",
                "other_confirmed",
            ],
        ),
        ([("status", "available")], ["mine_available", "other_available"]),
        (
            [("status", "available"), ("status", "confirmed")],
            ["mine_confirmed", "mine_available", "other_available", "other_confirmed"],
        ),
        ([("status", "available"), ("status", "available")], ["mine_available", "other_available"]),
        ([("status", "withdrawn")], ["mine_withdrawn"]),
        ([("ownership", "others"), ("status", "withdrawn")], []),
    ],
)
def test_list_clothing_filters_visibility_order_and_shape(
    client, settings, list_context, params, expected
):
    event, participant, token, _, rows = list_context
    event_id = event["event"]["id"]
    response = get_list(client, event_id, token, params)
    assert_items(
        response,
        expected,
        rows,
        event_id,
        participant,
        event["event"]["organizerParticipantId"],
        settings,
    )


def test_list_clothing_empty_event(client, registration_context):
    event, _, token, _, _ = registration_context
    response = get_list(client, event["event"]["id"], token)
    assert response.status_code == 200
    assert response.json() == {"items": [], "nextCursor": None}


def test_list_clothing_remains_available_after_close(client, db, list_context):
    event, _, token, _, _ = list_context
    event_id = event["event"]["id"]
    close_event(db, event_id, datetime.now(UTC))
    response = get_list(client, event_id, token)
    assert response.status_code == 200
    assert len(response.json()["items"]) == 5


@pytest.mark.parametrize("field", ["ownership", "status"])
@pytest.mark.parametrize("authenticated", [True, False])
def test_list_clothing_validates_filters_before_auth(client, list_context, field, authenticated):
    event, _, token, _, _ = list_context
    response = client.get(
        f"/api/v1/events/{event['event']['id']}/clothing",
        params={field: "invalid"},
        headers=headers(token) if authenticated else {},
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert any(item["field"] == field for item in error["details"]["fields"])


@pytest.mark.parametrize("token", [None, "invalid-token"])
def test_list_clothing_requires_auth(client, list_context, token):
    event, _, _, _, _ = list_context
    response = client.get(
        f"/api/v1/events/{event['event']['id']}/clothing", headers=headers(token) if token else {}
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_list_clothing_hides_inaccessible_events(client, list_context):
    _, _, token, foreign, _ = list_context
    errors = []
    for event_id in (str(uuid4()), "not-a-uuid", foreign["event"]["id"]):
        response = get_list(client, event_id, token)
        assert response.status_code == 404
        error = response.json()["error"].copy()
        assert error["code"] == "NOT_FOUND" and error["message"] == NotFoundError.message
        error.pop("requestId")
        errors.append(error)
    assert errors[0] == errors[1] == errors[2]


def test_registered_clothing_appears_for_owner_and_other_participant(client, registration_context):
    event, _, token, _, upload = registration_context
    event_id = event["event"]["id"]
    photo = upload(event_id, token)
    registered = client.post(
        f"/api/v1/events/{event_id}/clothing",
        headers=headers(token),
        json={
            "photoIds": [photo["id"]],
            "category": "top",
            "title": "  Green jacket  ",
            "description": "Green jacket",
            "measurements": {"chest": 21.0, "shoulder": 18.5},
        },
    )
    assert registered.status_code == 201
    clothing_id = registered.json()["id"]
    for viewer_token, ownership, is_mine in (
        (token, "mine", True),
        (event["participantToken"], "others", False),
    ):
        response = get_list(client, event_id, viewer_token, {"ownership": ownership})
        assert response.status_code == 200
        items = response.json()["items"]
        assert [item["id"] for item in items] == [clothing_id]
        assert items[0]["isMine"] is is_mine
        assert items[0]["category"] == "top"
        assert items[0]["title"] == "Green jacket"
        assert items[0]["measurements"] == {
            "totalLength": None,
            "chest": 21.0,
            "shoulder": 18.5,
            "sleeve": None,
            "waist": None,
            "hem": None,
            "inseam": None,
            "thigh": None,
        }
