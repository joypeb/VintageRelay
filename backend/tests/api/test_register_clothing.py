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
            json={"photoIds": [photo["id"]], "description": description},
        )
        assert response.status_code == 201
        assert response.json()["description"] == description
        stats = client.get(f"/api/v1/events/{event_id}", headers=organizer_headers)
        assert stats.status_code == 200
        assert stats.json()["stats"]["availableClothingCount"] == count
