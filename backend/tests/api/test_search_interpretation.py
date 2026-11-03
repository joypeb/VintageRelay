import logging
from datetime import UTC, datetime

import pytest

from app.ai.deps import _MissingKeyAnalyzer, get_analyzer
from app.ai.fake import FakeAnalyzer
from app.ai.protocols import AIUnavailableError
from app.ai.schemas import SearchInterpretation, SearchMeasurement
from tests.conftest import close_event


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def url(event_id):
    return f"/api/v1/events/{event_id}/search/interpretation"


def test_interpretation_returns_validated_conditions(client, app, registration_context):
    event, _, token, _, _ = registration_context
    fake = FakeAnalyzer(
        search_results=[
            SearchInterpretation(
                category="outer",
                colors=["green", "green", "chartreuse"],
                measurements=[
                    SearchMeasurement(name="chest", min=21, max=21),
                    SearchMeasurement(name="collar", min=10, max=11),
                ],
                unrecognized=["vintage"],
            )
        ]
    )
    app.dependency_overrides[get_analyzer] = lambda: fake
    response = client.post(
        url(event["event"]["id"]), headers=auth(token), json={"text": "green jacket"}
    )
    assert response.status_code == 200
    assert response.json() == {
        "category": "outer",
        "colors": ["green"],
        "measurements": {"chest": {"min": 20, "max": 22}},
        "unrecognized": ["vintage", "chartreuse", "collar"],
    }
    assert fake.search_calls == ["green jacket"]


@pytest.mark.parametrize("body", [{}, {"text": "   "}, {"text": "x" * 201}])
def test_invalid_text_is_rejected_without_calling_ai(client, app, registration_context, body):
    event, _, token, _, _ = registration_context
    fake = FakeAnalyzer()
    app.dependency_overrides[get_analyzer] = lambda: fake
    response = client.post(url(event["event"]["id"]), headers=auth(token), json=body)
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert "text" in [field["field"] for field in error["details"]["fields"]]
    assert error["requestId"] == response.headers["X-Request-ID"]
    assert fake.search_calls == []


def test_trimmed_200_character_text_is_accepted(client, app, registration_context):
    event, _, token, _, _ = registration_context
    fake = FakeAnalyzer()
    app.dependency_overrides[get_analyzer] = lambda: fake
    response = client.post(
        url(event["event"]["id"]), headers=auth(token), json={"text": "  " + "x" * 200 + "  "}
    )
    assert response.status_code == 200
    assert fake.search_calls == ["x" * 200]


def test_interpretation_works_after_event_closes(client, db, app, registration_context):
    event, _, token, _, _ = registration_context
    event_id = event["event"]["id"]
    close_event(db, event_id, datetime.now(UTC))
    fake = FakeAnalyzer()
    app.dependency_overrides[get_analyzer] = lambda: fake
    response = client.post(url(event_id), headers=auth(token), json={"text": "jacket"})
    assert response.status_code == 200
    assert fake.search_calls == ["jacket"]


def test_interpretation_requires_same_event_token(client, app, registration_context):
    _, _, token, create_event, _ = registration_context
    other = create_event("Other")
    fake = FakeAnalyzer()
    app.dependency_overrides[get_analyzer] = lambda: fake
    endpoint = url(other["event"]["id"])
    missing = client.post(endpoint, json={"text": "jacket"})
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "UNAUTHENTICATED"
    wrong = client.post(endpoint, headers=auth(token), json={"text": "jacket"})
    assert wrong.status_code == 404
    assert wrong.json()["error"]["code"] == "NOT_FOUND"
    assert fake.search_calls == []


def assert_unavailable(response):
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "AI_UNAVAILABLE"
    assert error["message"] == "Search could not understand that right now. Choose filters instead."
    assert error["requestId"] == response.headers["X-Request-ID"]


def test_ai_failure_returns_503_and_logs_metadata_without_text(
    client, app, registration_context, caplog
):
    event, _, token, _, _ = registration_context
    text = "private search phrase unique to this request"
    fake = FakeAnalyzer(search_results=[AIUnavailableError("model failed")])
    app.dependency_overrides[get_analyzer] = lambda: fake
    with caplog.at_level(logging.WARNING):
        response = client.post(url(event["event"]["id"]), headers=auth(token), json={"text": text})
    assert_unavailable(response)
    assert fake.search_calls == [text]
    records = [record for record in caplog.records if record.getMessage() == "ai_call_failed"]
    assert len(records) == 1
    record = records[0]
    assert record.levelno == logging.WARNING
    assert record.task == "search_interpretation"
    assert record.reason
    assert isinstance(record.latency_ms, (int, float)) and record.latency_ms >= 0
    assert all(text not in str(vars(record)) for record in caplog.records)
    assert text not in caplog.text


def test_missing_key_analyzer_returns_503(client, app, registration_context):
    event, _, token, _, _ = registration_context
    app.dependency_overrides[get_analyzer] = lambda: _MissingKeyAnalyzer()
    response = client.post(url(event["event"]["id"]), headers=auth(token), json={"text": "jacket"})
    assert_unavailable(response)
