import pytest


def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("organizer", [True, False])
@pytest.mark.parametrize("photo_count", [1, 10])
def test_register_clothing_returns_complete_resource(
    client, db, registration_context, organizer, photo_count
):
    event, participant, token, _, upload = registration_context
    event_id = event["event"]["id"]
    token = event["participantToken"] if organizer else token
    participant_id = event["event"]["organizerParticipantId"] if organizer else participant.id
    photos = [upload(event_id, token) for _ in range(photo_count)]
    response = client.post(
        f"/api/v1/events/{event_id}/clothing",
        headers=headers(token),
        json={
            "photoIds": [photo["id"] for photo in photos],
            "category": "top",
            "title": "Green denim jacket",
            "description": "  Green denim jacket, M  ",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {
        "id",
        "eventId",
        "owner",
        "isMine",
        "photos",
        "description",
        "category",
        "title",
        "measurements",
        "status",
        "contentVersion",
        "analysis",
        "createdAt",
        "updatedAt",
    }
    assert body["eventId"] == event_id
    assert body["owner"] == {
        "participantId": participant_id,
        "displayName": "Mina" if organizer else "Joon",
        "isOrganizer": organizer,
    }
    assert body["isMine"] is True
    assert body["photos"] == [{"id": photo["id"], "url": photo["url"]} for photo in photos]
    from app.models.photo import Photo

    with db.read() as session:
        for index, photo in enumerate(photos):
            row = session.get(Photo, photo["id"])
            assert (row.clothing_id, row.position) == (body["id"], index)
    assert body["category"] == "top"
    assert body["title"] == "Green denim jacket"
    assert body["measurements"] is None
    assert body["description"] == "Green denim jacket, M"
    assert body["status"] == "available"
    assert body["contentVersion"] == 1
    assert body["analysis"] is None
    assert body["createdAt"] == body["updatedAt"]


def test_register_clothing_description_boundaries_and_event_count(client, registration_context):
    event, _, token, _, upload = registration_context
    event_id = event["event"]["id"]
    path = f"/api/v1/events/{event_id}/clothing"
    organizer_headers = headers(event["participantToken"])
    initial = client.get(f"/api/v1/events/{event_id}", headers=organizer_headers)
    assert initial.status_code == 200
    assert initial.json()["stats"]["availableClothingCount"] == 0
    for count, description in enumerate(("x", "x" * 1000, "first line\nsecond line"), 1):
        photo = upload(event_id, token)
        response = client.post(
            path,
            headers=headers(token),
            json={
                "photoIds": [photo["id"]],
                "category": "top",
                "title": "Green denim jacket",
                "description": description,
            },
        )
        assert response.status_code == 201
        assert response.json()["description"] == description
        stats = client.get(f"/api/v1/events/{event_id}", headers=organizer_headers)
        assert stats.status_code == 200
        assert stats.json()["stats"]["availableClothingCount"] == count


@pytest.mark.parametrize(
    ("category", "measurements"),
    [
        ("top", {"chest": 21.0, "sleeve": 24.5}),
        ("outer", {"totalLength": 28.0, "shoulder": 18.5}),
        ("bottom", {"totalLength": 40.0, "waist": 32.0, "hem": 8.0, "inseam": 30.0, "thigh": 24.0}),
    ],
)
def test_register_clothing_with_partial_measurements(
    client, registration_context, category, measurements
):
    event, _, token, _, upload = registration_context
    event_id = event["event"]["id"]
    photo = upload(event_id, token)
    response = client.post(
        f"/api/v1/events/{event_id}/clothing",
        headers=headers(token),
        json={
            "photoIds": [photo["id"]],
            "category": category,
            "title": "  Green denim jacket  ",
            "description": "Cropped, M",
            "measurements": measurements,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {
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
    assert body["category"] == category
    assert body["title"] == "Green denim jacket"
    assert body["description"] == "Cropped, M"
    assert body["measurements"] == {
        name: measurements.get(name)
        for name in (
            "totalLength",
            "chest",
            "shoulder",
            "sleeve",
            "waist",
            "hem",
            "inseam",
            "thigh",
        )
    }


@pytest.mark.parametrize("include_empty", [False, True])
def test_register_bottom_without_measurements(client, registration_context, include_empty):
    event, _, token, _, upload = registration_context
    event_id = event["event"]["id"]
    photo = upload(event_id, token)
    body = {
        "photoIds": [photo["id"]],
        "category": "bottom",
        "title": "White pants",
        "description": "Size M",
    }
    if include_empty:
        body["measurements"] = {}
    response = client.post(f"/api/v1/events/{event_id}/clothing", headers=headers(token), json=body)
    assert response.status_code == 201
    assert response.json()["measurements"] is None


@pytest.mark.parametrize(("category", "measurements"), [("other", {}), ("top", None)])
def test_register_clothing_with_empty_or_null_measurements(
    client, registration_context, category, measurements
):
    event, _, token, _, upload = registration_context
    event_id = event["event"]["id"]
    photo = upload(event_id, token)
    response = client.post(
        f"/api/v1/events/{event_id}/clothing",
        headers=headers(token),
        json={
            "photoIds": [photo["id"]],
            "category": category,
            "title": "Jacket",
            "description": "Size M",
            "measurements": measurements,
        },
    )
    assert response.status_code == 201
    assert response.json()["measurements"] is None


def test_register_clothing_with_title_at_maximum_length(client, registration_context):
    event, _, token, _, upload = registration_context
    event_id = event["event"]["id"]
    photo = upload(event_id, token)
    response = client.post(
        f"/api/v1/events/{event_id}/clothing",
        headers=headers(token),
        json={
            "photoIds": [photo["id"]],
            "category": "top",
            "title": "x" * 100,
            "description": "Size M",
        },
    )
    assert response.status_code == 201
    assert response.json()["title"] == "x" * 100
