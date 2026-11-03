from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.models.clothing import Clothing
from app.models.clothing_analysis import ClothingAnalysis
from tests.conftest import close_event


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def seed(
    db,
    event_id,
    owner_id,
    title,
    *,
    status="available",
    category="top",
    chest=None,
    length=None,
    colors=None,
    created_at=None,
):
    now = created_at or datetime.now(UTC)
    clothing = Clothing(
        id=str(uuid4()),
        event_id=event_id,
        owner_id=owner_id,
        title=title,
        category=category,
        description="A garment",
        status=status,
        content_version=1,
        measure_chest=chest,
        measure_total_length=length,
        created_at=now,
        updated_at=now,
    )
    with db.write() as session:
        session.add(clothing)
        if colors is not None:
            session.add(
                ClothingAnalysis(
                    id=str(uuid4()),
                    clothing_id=clothing.id,
                    content_version=1,
                    status="done",
                    features={"colors": colors},
                    uncertainties=[],
                    updated_at=now,
                )
            )
    return clothing.id


def test_search_matches_home_shape_filters_and_parses_ranges_and_colors(
    client, db, registration_context
):
    event, participant, token, _, _ = registration_context
    event_id = event["event"]["id"]
    organizer = event["event"]["organizerParticipantId"]
    now = datetime.now(UTC)
    winner = seed(
        db,
        event_id,
        organizer,
        "Winner",
        chest=20,
        length=30,
        colors=["green", "black"],
        created_at=now - timedelta(seconds=3),
    )
    zero = seed(
        db, event_id, organizer, "Zero", chest=50, length=50, created_at=now - timedelta(seconds=2)
    )
    missing = seed(db, event_id, organizer, "Missing", created_at=now - timedelta(seconds=1))
    seed(db, event_id, participant.id, "Own", colors=["green"])
    seed(db, event_id, organizer, "Withdrawn", status="withdrawn")
    seed(db, event_id, organizer, "Confirmed", status="confirmed")
    seed(db, event_id, organizer, "Other category", category="bottom")
    url = f"/api/v1/events/{event_id}/clothing"
    home = client.get(
        url, headers=auth(token), params={"ownership": "others", "status": "available"}
    )
    assert home.status_code == 200
    response = client.get(
        f"{url}/search",
        headers=auth(token),
        params=[
            ("category", "top"),
            ("color", "green"),
            ("color", "black"),
            ("chestMin", "20"),
            ("chestMax", "20"),
            ("totalLengthMax", "30"),
            ("ignored", "anything"),
        ],
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"items", "conditionCount", "nextCursor"}
    assert body["conditionCount"] == 4
    assert body["nextCursor"] is None
    assert [
        (x["clothing"]["id"], x["matchCount"], x["missingMeasurements"]) for x in body["items"]
    ] == [
        (winner, 4, False),
        (zero, 0, False),
        (missing, 0, True),
    ]
    home_by_id = {item["id"]: item for item in home.json()["items"]}
    assert all(item["clothing"] == home_by_id[item["clothing"]["id"]] for item in body["items"])


def test_duplicate_color_counts_once_and_no_conditions_match_home_order(
    client, db, registration_context
):
    event, _, token, _, _ = registration_context
    event_id = event["event"]["id"]
    organizer = event["event"]["organizerParticipantId"]
    seed(db, event_id, organizer, "Green", colors=["green"])
    url = f"/api/v1/events/{event_id}/clothing"
    home = client.get(
        url, headers=auth(token), params={"ownership": "others", "status": "available"}
    ).json()
    empty = client.get(f"{url}/search", headers=auth(token))
    assert empty.status_code == 200
    assert empty.json() == {
        "items": [
            {"clothing": item, "matchCount": 0, "missingMeasurements": False}
            for item in home["items"]
        ],
        "conditionCount": 0,
        "nextCursor": None,
    }
    response = client.get(
        f"{url}/search", headers=auth(token), params=[("color", "green"), ("color", "green")]
    )
    assert response.status_code == 200
    assert response.json()["conditionCount"] == 1
    assert response.json()["items"][0]["matchCount"] == 1


def test_keyword_matches_owner_text_once_case_insensitively(client, db, registration_context):
    event, _, token, _, _ = registration_context
    event_id = event["event"]["id"]
    organizer = event["event"]["organizerParticipantId"]
    plain = seed(db, event_id, organizer, "Plain tee")
    denim = seed(db, event_id, organizer, "Denim chore coat")
    response = client.get(
        f"/api/v1/events/{event_id}/clothing/search",
        headers=auth(token),
        params=[("keyword", "DENIM"), ("keyword", "denim")],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["conditionCount"] == 1
    assert [(x["clothing"]["id"], x["matchCount"]) for x in body["items"]] == [
        (denim, 1),
        (plain, 0),
    ]


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"category": "unknown"}, "category"),
        ({"color": "unknown"}, "color"),
        ({"chestMin": "abc"}, "chestMin"),
        ({"chestMin": "0"}, "chestMin"),
        ({"totalLengthMax": "121"}, "totalLengthMax"),
        ({"chestMin": "30", "chestMax": "20"}, "chestMin"),
        ({"keyword": "x" * 41}, "keyword"),
        ({"keyword": " "}, "keyword"),
    ],
)
def test_invalid_query_returns_validation_error(client, registration_context, params, field):
    event, _, token, _, _ = registration_context
    response = client.get(
        f"/api/v1/events/{event['event']['id']}/clothing/search", headers=auth(token), params=params
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert field in [entry["field"] for entry in error["details"]["fields"]]
    assert error["requestId"] == response.headers["X-Request-ID"]


def test_search_requires_same_event_token(client, registration_context):
    _event, _, token, create_event, _ = registration_context
    other = create_event("Other")
    url = f"/api/v1/events/{other['event']['id']}/clothing/search"
    missing = client.get(url)
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "UNAUTHENTICATED"
    wrong = client.get(url, headers=auth(token))
    assert wrong.status_code == 404
    assert wrong.json()["error"]["code"] == "NOT_FOUND"


def test_search_works_after_event_closes(client, db, registration_context):
    event, _, token, _, _ = registration_context
    event_id = event["event"]["id"]
    close_event(db, event_id, datetime.now(UTC))
    response = client.get(f"/api/v1/events/{event_id}/clothing/search", headers=auth(token))
    assert response.status_code == 200
    assert response.json() == {"items": [], "conditionCount": 0, "nextCursor": None}
