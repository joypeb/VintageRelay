from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.domain.errors import NotFoundError
from app.models.clothing import Clothing
from app.models.photo import Photo
from tests.conftest import close_event


@pytest.fixture
def detail_context(db, registration_context):
    event, participant, token, create_event, _ = registration_context
    foreign = create_event("Foreign")
    event_id = event["event"]["id"]
    now = datetime(2026, 10, 30, 12, tzinfo=UTC)
    rows = {}
    with db.write() as session:
        for name, target_event, owner_id, clothing_status in (
            ("mine", event_id, participant.id, "available"),
            ("other", event_id, event["event"]["organizerParticipantId"], "confirmed"),
            ("withdrawn", event_id, event["event"]["organizerParticipantId"], "withdrawn"),
            (
                "foreign",
                foreign["event"]["id"],
                foreign["event"]["organizerParticipantId"],
                "available",
            ),
        ):
            photo_id = str(uuid4())
            session.add(
                Photo(
                    id=photo_id,
                    event_id=target_event,
                    uploader_id=owner_id,
                    storage_location=f"{photo_id}.jpg",
                    content_type="image/jpeg",
                    size_bytes=123,
                    created_at=now,
                )
            )
            session.flush()
            clothing_id = str(uuid4())
            session.add(
                Clothing(
                    id=clothing_id,
                    event_id=target_event,
                    owner_id=owner_id,
                    photo_id=photo_id,
                    description=name,
                    status=clothing_status,
                    content_version=1,
                    created_at=now,
                    updated_at=now,
                )
            )
            rows[name] = {"id": clothing_id, "photo_id": photo_id, "status": clothing_status}
    return event, participant, token, rows, now


def get_clothing(client, clothing_id, token):
    return client.get(
        f"/api/v1/clothing/{clothing_id}",
        headers={"Authorization": f"Bearer {token}"} if token else {},
    )


@pytest.mark.parametrize("name", ["mine", "other", "withdrawn"])
def test_get_clothing_returns_complete_resource(client, settings, detail_context, name):
    event, participant, token, rows, now = detail_context
    response = get_clothing(client, rows[name]["id"], token)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "id",
        "eventId",
        "owner",
        "isMine",
        "photo",
        "description",
        "status",
        "contentVersion",
        "analysis",
        "createdAt",
        "updatedAt",
    }
    is_mine = name == "mine"
    assert body["id"] == rows[name]["id"]
    assert body["eventId"] == event["event"]["id"]
    assert body["owner"] == {
        "participantId": participant.id if is_mine else event["event"]["organizerParticipantId"],
        "displayName": "Joon" if is_mine else "Mina",
        "isOrganizer": not is_mine,
    }
    assert body["isMine"] is is_mine
    assert body["photo"] == {
        "id": rows[name]["photo_id"],
        "url": f"{settings.app_base_url}/api/v1/photos/{rows[name]['photo_id']}",
    }
    assert body["description"] == name
    assert body["status"] == rows[name]["status"]
    assert body["contentVersion"] == 1 and body["analysis"] is None
    assert datetime.fromisoformat(body["createdAt"]) == now
    assert body["updatedAt"] == body["createdAt"]


def test_get_clothing_hides_inaccessible_garments(client, detail_context):
    _, _, token, rows, _ = detail_context
    errors = []
    for clothing_id in (rows["foreign"]["id"], str(uuid4()), "not-a-uuid"):
        response = get_clothing(client, clothing_id, token)
        assert response.status_code == 404
        error = response.json()["error"].copy()
        assert error["code"] == "NOT_FOUND"
        assert error["message"] == NotFoundError.message
        error.pop("requestId")
        errors.append(error)
    assert errors[0] == errors[1] == errors[2]


@pytest.mark.parametrize("token", [None, "invalid-token"])
def test_get_clothing_requires_authentication(client, detail_context, token):
    _, _, _, rows, _ = detail_context
    response = get_clothing(client, rows["mine"]["id"], token)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_get_clothing_remains_available_after_event_closes(client, db, detail_context):
    event, _, token, rows, now = detail_context
    close_event(db, event["event"]["id"], now)
    response = get_clothing(client, rows["withdrawn"]["id"], token)
    assert response.status_code == 200
    assert response.json()["status"] == "withdrawn"
