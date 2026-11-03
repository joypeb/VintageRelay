import logging
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select, update

from app.core.logging import JsonFormatter, TextFormatter
from app.domain.errors import NotFoundError
from app.models.clothing import Clothing
from app.models.photo import Photo
from tests.conftest import close_event


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def patch_clothing(client, clothing_id, token, body):
    return client.patch(
        f"/api/v1/clothing/{clothing_id}",
        headers=auth(token) if token else {},
        json=body,
    )


def get_clothing(client, clothing_id, token):
    return client.get(
        f"/api/v1/clothing/{clothing_id}",
        headers=auth(token) if token else {},
    )


def assert_error(response, status, code):
    assert response.status_code == status
    error = response.json()["error"]
    assert set(error) == {"code", "message", "details", "requestId"}
    assert error["code"] == code
    assert error["requestId"] == response.headers["X-Request-ID"]
    return error


def set_status(db, clothing_id, status):
    with db.write() as session:
        session.execute(update(Clothing).where(Clothing.id == clothing_id).values(status=status))


def attached_photo_ids(db, clothing_id):
    with db.read() as session:
        rows = session.scalars(
            select(Photo).where(Photo.clothing_id == clothing_id).order_by(Photo.position)
        ).all()
        return [(photo.id, photo.position) for photo in rows]


@pytest.fixture
def edit_context(client, registration_context):
    event, participant, token, create_event, upload = registration_context
    event_id = event["event"]["id"]
    photos = [upload(event_id, token) for _ in range(3)]
    response = client.post(
        f"/api/v1/events/{event_id}/clothing",
        headers=auth(token),
        json={
            "photoIds": [photo["id"] for photo in photos],
            "category": "top",
            "title": "Green denim jacket",
            "description": "Cropped green jacket, size M.",
            "measurements": {"chest": 21.0, "shoulder": 18.5},
        },
    )
    assert response.status_code == 201
    return {
        "event": event,
        "participant": participant,
        "token": token,
        "create_event": create_event,
        "upload": upload,
        "clothing": response.json(),
        "photos": photos,
    }


def test_edit_title_bumps_content_version_and_updated_at(client, db, edit_context):
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"]

    before = get_clothing(client, clothing_id, token).json()

    response = patch_clothing(client, clothing_id, token, {"title": "Updated green jacket"})

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == clothing_id
    assert body["title"] == "Updated green jacket"
    assert body["description"] == before["description"]
    assert body["category"] == before["category"]
    assert body["photos"] == before["photos"]
    assert body["contentVersion"] == before["contentVersion"] + 1
    assert datetime.fromisoformat(body["updatedAt"]) >= datetime.fromisoformat(before["updatedAt"])
    assert body["createdAt"] == before["createdAt"]


def test_edit_identical_values_replays_without_version_bump(client, edit_context):
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"]

    current = get_clothing(client, clothing_id, token).json()
    replay = {
        "photoIds": [photo["id"] for photo in current["photos"]],
        "category": current["category"],
        "title": current["title"],
        "description": current["description"],
        "measurements": current["measurements"],
    }

    response = patch_clothing(client, clothing_id, token, replay)

    assert response.status_code == 200
    body = response.json()
    assert body["contentVersion"] == current["contentVersion"]
    assert body["updatedAt"] == current["updatedAt"]
    assert body["photos"] == current["photos"]


def test_edit_reorders_photos_and_detaches_dropped(client, db, edit_context):
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"]
    first, second, third = [photo["id"] for photo in edit_context["photos"]]

    response = patch_clothing(client, clothing_id, token, {"photoIds": [third, first]})

    assert response.status_code == 200
    assert [photo["id"] for photo in response.json()["photos"]] == [third, first]
    assert attached_photo_ids(db, clothing_id) == [(third, 0), (first, 1)]
    with db.read() as session:
        dropped = session.get(Photo, second)
        assert dropped is not None
        assert dropped.clothing_id is None
        assert dropped.position is None


def test_edit_with_photo_from_other_garment_conflicts_and_changes_nothing(client, db, edit_context):
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"]
    event_id = edit_context["event"]["event"]["id"]
    before = get_clothing(client, clothing_id, token).json()

    other_photo = edit_context["upload"](event_id, token)
    other = client.post(
        f"/api/v1/events/{event_id}/clothing",
        headers=auth(token),
        json={
            "photoIds": [other_photo["id"]],
            "category": "top",
            "title": "Other jacket",
            "description": "Other jacket.",
        },
    )
    assert other.status_code == 201

    response = patch_clothing(
        client,
        clothing_id,
        token,
        {"photoIds": [before["photos"][0]["id"], other_photo["id"]], "title": "Changed title"},
    )

    assert_error(response, 409, "PHOTO_ALREADY_ATTACHED")
    current = get_clothing(client, clothing_id, token).json()
    assert current["title"] == before["title"]
    assert current["photos"] == before["photos"]
    assert current["contentVersion"] == before["contentVersion"]
    assert [photo_id for photo_id, _ in attached_photo_ids(db, clothing_id)] == [
        photo["id"] for photo in before["photos"]
    ]


def test_edit_with_unknown_or_inaccessible_photo_returns_not_found(client, db, edit_context):
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"]
    event_id = edit_context["event"]["event"]["id"]
    create_event = edit_context["create_event"]
    upload = edit_context["upload"]

    other = create_event("Other")
    other_photo = upload(other["event"]["id"], other["participantToken"])
    same_event_other_photo = upload(event_id, edit_context["event"]["participantToken"])
    before_version = get_clothing(client, clothing_id, token).json()["contentVersion"]

    errors = []
    for photo_id in (str(uuid4()), "not-a-uuid", other_photo["id"], same_event_other_photo["id"]):
        response = patch_clothing(client, clothing_id, token, {"photoIds": [photo_id]})

        error = assert_error(response, 404, "NOT_FOUND").copy()
        assert error["message"] == NotFoundError.message
        error.pop("requestId")
        errors.append(error)

    assert all(error == errors[0] for error in errors)
    assert get_clothing(client, clothing_id, token).json()["contentVersion"] == before_version


def test_edit_hides_cross_event_garment_and_token(client, edit_context):
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"]
    create_event = edit_context["create_event"]

    foreign = create_event("Foreign")
    foreign_token = foreign["participantToken"]
    foreign_photo = edit_context["upload"](foreign["event"]["id"], foreign_token)
    foreign_garment = client.post(
        f"/api/v1/events/{foreign['event']['id']}/clothing",
        headers=auth(foreign_token),
        json={
            "photoIds": [foreign_photo["id"]],
            "category": "top",
            "title": "Foreign jacket",
            "description": "Foreign jacket.",
        },
    )
    assert foreign_garment.status_code == 201

    errors = []
    for target_id, viewer in (
        (foreign_garment.json()["id"], token),
        (clothing_id, foreign_token),
        (str(uuid4()), token),
    ):
        response = patch_clothing(client, target_id, viewer, {"title": "Changed title"})

        error = assert_error(response, 404, "NOT_FOUND").copy()
        assert error["message"] == NotFoundError.message
        error.pop("requestId")
        errors.append(error)

    assert all(error == errors[0] for error in errors)


def test_edit_by_same_event_non_owner_is_forbidden(client, edit_context):
    clothing_id = edit_context["clothing"]["id"]
    organizer_token = edit_context["event"]["participantToken"]
    before = get_clothing(client, clothing_id, edit_context["token"]).json()

    response = patch_clothing(client, clothing_id, organizer_token, {"title": "Changed title"})

    assert_error(response, 403, "FORBIDDEN")
    assert get_clothing(client, clothing_id, edit_context["token"]).json() == before


@pytest.mark.parametrize("token", [None, "invalid-token"])
def test_edit_requires_authentication(client, edit_context, token):
    response = patch_clothing(
        client, edit_context["clothing"]["id"], token, {"title": "Changed title"}
    )

    assert_error(response, 401, "UNAUTHENTICATED")


@pytest.mark.parametrize("authenticated", [True, False])
@pytest.mark.parametrize(
    ("body", "field", "reason"),
    [
        ({}, None, None),
        ({"title": "Jacket", "extra": True}, "extra", "unknown_field"),
        ({"category": "shoes"}, "category", "invalid"),
        ({"photoIds": ["photo-1", "photo-1"]}, "photoIds", "invalid"),
        ({"photoIds": []}, "photoIds", "required"),
        ({"title": "   "}, "title", "required"),
    ],
)
def test_edit_validation_precedes_auth(
    client, db, edit_context, body, field, reason, authenticated
):
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"] if authenticated else None
    before = get_clothing(client, clothing_id, edit_context["token"]).json()

    response = patch_clothing(client, clothing_id, token, body)

    error = assert_error(response, 422, "VALIDATION_ERROR")
    if field is not None:
        assert {"field": field, "reason": reason} in error["details"]["fields"]
    assert get_clothing(client, clothing_id, edit_context["token"]).json() == before


def test_edit_withdrawn_garment_conflicts(client, db, edit_context):
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"]
    set_status(db, edit_context["clothing"]["id"], "withdrawn")
    before = get_clothing(client, clothing_id, token).json()
    assert before["status"] == "withdrawn"

    response = patch_clothing(client, clothing_id, token, {"title": "Changed title"})

    assert_error(response, 409, "CLOTHING_NOT_AVAILABLE")
    assert (
        get_clothing(client, clothing_id, token).json()["contentVersion"]
        == before["contentVersion"]
    )


def test_edit_confirmed_garment_conflicts_with_guidance(client, db, edit_context):
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"]
    set_status(db, clothing_id, "confirmed")

    response = patch_clothing(client, clothing_id, token, {"title": "Changed title"})

    error = assert_error(response, 409, "CLOTHING_ALREADY_CONFIRMED")
    assert error["message"] == "Cancel the confirmed exchange before editing this garment."


@pytest.mark.parametrize("status", ["withdrawn", "confirmed"])
def test_edit_closed_event_takes_precedence_over_feature_state(client, db, edit_context, status):
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"]
    set_status(db, clothing_id, status)
    close_event(db, edit_context["event"]["event"]["id"], datetime.now(UTC))

    response = patch_clothing(client, clothing_id, token, {"title": "Changed title"})

    assert_error(response, 409, "EVENT_CLOSED")


def test_edit_closed_event_rejects_changed_content(client, db, edit_context):
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"]
    close_event(db, edit_context["event"]["event"]["id"], datetime.now(UTC))

    response = patch_clothing(client, clothing_id, token, {"title": "Changed title"})

    assert_error(response, 409, "EVENT_CLOSED")


def test_edit_closed_event_replays_unchanged_content(client, db, edit_context):
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"]
    current = get_clothing(client, clothing_id, token).json()
    close_event(db, edit_context["event"]["event"]["id"], datetime.now(UTC))

    response = patch_clothing(
        client,
        clothing_id,
        token,
        {
            "photoIds": [photo["id"] for photo in current["photos"]],
            "category": current["category"],
            "title": current["title"],
            "description": current["description"],
            "measurements": current["measurements"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["contentVersion"] == current["contentVersion"]
    assert body["updatedAt"] == current["updatedAt"]


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"category": "bottom", "measurements": {"sleeve": 20.0}}, "measurements.sleeve"),
        ({"category": "other", "measurements": {"chest": 20.0}}, "measurements"),
        ({"measurements": {"chest": 0}}, "measurements.chest"),
        ({"measurements": {"chest": "wide"}}, "measurements.chest"),
    ],
)
def test_edit_rejects_invalid_category_and_measurements(client, edit_context, body, field):
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"]
    before = get_clothing(client, clothing_id, token).json()

    response = patch_clothing(client, clothing_id, token, body)

    error = assert_error(response, 422, "VALIDATION_ERROR")
    assert any(item["field"] == field for item in error["details"]["fields"])
    assert get_clothing(client, clothing_id, token).json() == before


def test_edit_logs_updated_fields_without_content_text(client, caplog, edit_context):
    caplog.set_level(logging.INFO)
    clothing_id = edit_context["clothing"]["id"]
    token = edit_context["token"]
    updated_title = "Updated green jacket for autumn"

    response = patch_clothing(client, clothing_id, token, {"title": updated_title})

    assert response.status_code == 200
    records = [record for record in caplog.records if record.getMessage() == "clothing_updated"]
    assert len(records) == 1
    record = records[0]
    assert record.clothing_id == clothing_id
    assert record.content_version == response.json()["contentVersion"]
    assert "title" in record.changed_fields
    assert record.photo_count == len(edit_context["photos"])
    assert record.invalidated_proposal_count == 0
    for formatter in (JsonFormatter(), TextFormatter()):
        formatted = formatter.format(record)
        assert updated_title not in formatted
        assert "Cropped green jacket, size M." not in formatted
