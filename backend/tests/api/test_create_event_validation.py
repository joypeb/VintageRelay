import pytest
from sqlalchemy import select

from app.models.event import Event
from app.models.participant import Participant
from tests.conftest import count_rows


@pytest.mark.parametrize(
    ("payload", "fields"),
    [
        pytest.param(
            {"organizerDisplayName": "Mina"},
            [{"field": "name", "reason": "required"}],
            id="missing-name",
        ),
        pytest.param(
            {"name": None, "organizerDisplayName": "Mina"},
            [{"field": "name", "reason": "required"}],
            id="null-name",
        ),
        pytest.param(
            {"name": "   ", "organizerDisplayName": "Mina"},
            [{"field": "name", "reason": "required"}],
            id="blank-name",
        ),
        pytest.param(
            {"name": "　", "organizerDisplayName": "Mina"},
            [{"field": "name", "reason": "required"}],
            id="unicode-blank-name",
        ),
        pytest.param(
            {"name": "a" * 61, "organizerDisplayName": "Mina"},
            [{"field": "name", "reason": "too_long"}],
            id="long-name",
        ),
        pytest.param(
            {"name": "Swap", "organizerDisplayName": "a" * 31},
            [{"field": "organizerDisplayName", "reason": "too_long"}],
            id="long-display-name",
        ),
        pytest.param(
            {"name": "Swap", "organizerDisplayName": 123},
            [{"field": "organizerDisplayName", "reason": "invalid_type"}],
            id="numeric-display-name",
        ),
        pytest.param(
            {"name": ["a"], "organizerDisplayName": "Mina"},
            [{"field": "name", "reason": "invalid_type"}],
            id="array-name",
        ),
        pytest.param(
            {"name": "Swap", "organizerDisplayName": "Mina\nKim"},
            [{"field": "organizerDisplayName", "reason": "invalid_characters"}],
            id="newline-display-name",
        ),
        pytest.param(
            {"name": "Swap\tCorner", "organizerDisplayName": "Mina"},
            [{"field": "name", "reason": "invalid_characters"}],
            id="tab-name",
        ),
        pytest.param(
            {"name": "Swap", "organizerDisplayName": "Mina", "theme": "denim"},
            [{"field": "theme", "reason": "unknown_field"}],
            id="extra-field",
        ),
        pytest.param(
            {"name": "Swap", "organizerDisplayName": "Mina", "theme": None},
            [{"field": "theme", "reason": "unknown_field"}],
            id="null-extra-field",
        ),
        pytest.param(
            {"name": "Swap", "organizerDisplayName": "Mina", "some_key": 1},
            [{"field": "some_key", "reason": "unknown_field"}],
            id="snake-case-extra-field",
        ),
        pytest.param(
            {"name": "Swap", "organizer_display_name": "Mina\nKim"},
            [{"field": "organizerDisplayName", "reason": "invalid_characters"}],
            id="snake-case-declared-field",
        ),
        pytest.param(
            {},
            [
                {"field": "name", "reason": "required"},
                {"field": "organizerDisplayName", "reason": "required"},
            ],
            id="both-fields-missing",
        ),
    ],
)
def test_invalid_fields_return_validation_error_without_persistence(client, db, payload, fields):
    response = client.post("/api/v1/events", json=payload)

    assert count_rows(db, "events") == 0
    assert count_rows(db, "participants") == 0
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["requestId"] == response.headers["X-Request-ID"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["details"]["fields"] == fields


@pytest.mark.parametrize(
    "content",
    [
        pytest.param(b'{"name":', id="malformed-json"),
        pytest.param(b"[]", id="array-body"),
        pytest.param(b'"text"', id="string-body"),
        pytest.param(b"", id="empty-body"),
    ],
)
def test_invalid_body_returns_bad_request_without_persistence(client, db, content):
    response = client.post(
        "/api/v1/events", content=content, headers={"Content-Type": "application/json"}
    )

    assert count_rows(db, "events") == 0
    assert count_rows(db, "participants") == 0
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "BAD_REQUEST"
    assert error["details"] is None
    assert error["requestId"] == response.headers["X-Request-ID"]


@pytest.mark.parametrize(
    ("name", "display_name", "expected_display_name"),
    [
        pytest.param("a" * 60, "Mina", "Mina", id="name-60-code-points"),
        pytest.param("Swap", "a" * 30, "a" * 30, id="display-name-30-code-points"),
        pytest.param("Swap", "가" * 30, "가" * 30, id="korean-30-code-points"),
        pytest.param("Swap", "Mina\n", "Mina", id="trim-trailing-newline"),
    ],
)
def test_valid_boundaries_create_one_linked_event(
    client, db, name, display_name, expected_display_name
):
    response = client.post(
        "/api/v1/events", json={"name": name, "organizerDisplayName": display_name}
    )

    assert response.status_code == 201
    assert count_rows(db, "events") == 1
    assert count_rows(db, "participants") == 1
    with db.read() as session:
        event = session.execute(select(Event)).scalar_one()
        participant = session.execute(select(Participant)).scalar_one()
        assert event.name == name
        assert participant.display_name == expected_display_name
        assert event.organizer_participant_id == participant.id
        assert participant.event_id == event.id
        assert response.json()["event"]["id"] == event.id
        assert response.json()["event"]["organizerParticipantId"] == participant.id
        assert response.json()["event"]["name"] == name
        assert response.json()["event"]["me"]["displayName"] == expected_display_name
