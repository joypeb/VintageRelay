from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_trailing_slash_in_base_url_produces_normalized_entry_url(settings, db):
    app = create_app(
        Settings(database_url=settings.database_url, app_base_url="https://vintage-relay.test/"),
        db,
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/events", json={"name": "Swap", "organizerDisplayName": "Mina"}
        )

    assert response.status_code == 201
    event = response.json()["event"]
    assert event["entryUrl"] == f"https://vintage-relay.test/join?code={event['entryCode']}"


def test_trailing_slash_in_base_url_allows_frontend_preflight(settings, db):
    app = create_app(
        Settings(database_url=settings.database_url, app_base_url="https://vintage-relay.test/"),
        db,
    )

    with TestClient(app) as client:
        response = client.options(
            "/api/v1/events",
            headers={
                "Origin": "https://vintage-relay.test",
                "Access-Control-Request-Method": "POST",
            },
        )

    assert response.headers.get("access-control-allow-origin") == "https://vintage-relay.test"
