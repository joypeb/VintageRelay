from fastapi import FastAPI
from fastapi.testclient import TestClient

ORIGIN = "https://vintage-relay.test"


def test_allowed_origin_preflight_allows_required_headers(client: TestClient) -> None:
    response = client.options(
        "/api/v1/events",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization, content-type, x-request-id",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ORIGIN
    allowed = {
        header.strip().lower()
        for header in response.headers["access-control-allow-headers"].split(",")
    }
    assert {"authorization", "content-type", "x-request-id"} <= allowed


def test_allowed_origin_response_exposes_request_id(client: TestClient) -> None:
    response = client.get("/api/v1/health", headers={"Origin": ORIGIN})

    exposed = response.headers["access-control-expose-headers"].lower().split(",")
    assert "x-request-id" in {header.strip() for header in exposed}


def test_disallowed_origin_preflight_omits_allow_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/events",
        headers={"Origin": "https://evil.test", "Access-Control-Request-Method": "POST"},
    )

    assert "access-control-allow-origin" not in response.headers


def test_allowed_origin_server_error_includes_allow_origin(
    app: FastAPI, client_no_raise: TestClient
) -> None:
    def fail() -> None:
        raise RuntimeError("failure")

    app.add_api_route("/test-failure", fail)

    response = client_no_raise.get("/test-failure", headers={"Origin": ORIGIN})

    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == ORIGIN
