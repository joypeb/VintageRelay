import app.models  # noqa: F401
from tests.conftest import count_rows


def fail(*args, **kwargs):
    raise RuntimeError("injected failure")


def test_organizer_link_failure_returns_500_and_rolls_back(client_no_raise, db, monkeypatch):
    monkeypatch.setattr("app.repositories.event.set_organizer", fail)

    response = client_no_raise.post(
        "/api/v1/events", json={"name": "Swap", "organizerDisplayName": "Mina"}
    )

    assert response.status_code == 500
    error = response.json()["error"]
    assert error["code"] == "INTERNAL_ERROR"
    assert error["details"] is None
    assert error["requestId"] == response.headers["X-Request-ID"]
    assert count_rows(db, "events") == count_rows(db, "participants") == 0
