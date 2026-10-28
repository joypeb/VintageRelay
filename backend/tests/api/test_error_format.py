import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.logging import TextFormatter
from app.domain.errors import AppError


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"


def test_request_id_provided_is_echoed(client: TestClient) -> None:
    response = client.get("/api/v1/health", headers={"X-Request-ID": "t-1"})

    assert response.headers["X-Request-ID"] == "t-1"


def test_request_id_missing_is_generated(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.headers["X-Request-ID"]


def test_missing_route_returns_not_found_error(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    error = response.json()["error"]
    assert set(error) == {"code", "message", "details", "requestId"}
    assert error["code"] == "NOT_FOUND"
    assert isinstance(error["message"], str)
    assert error["details"] is None
    assert error["requestId"] == response.headers["X-Request-ID"]


def test_app_error_returns_conflict(app: FastAPI, client: TestClient) -> None:
    def conflict() -> None:
        raise ConflictError()

    app.add_api_route("/test-conflict", conflict)

    response = client.get("/test-conflict")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"


def test_unhandled_error_returns_safe_response_and_log(
    app: FastAPI, client_no_raise: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    def fail() -> None:
        raise RuntimeError("secret-detail")

    app.add_api_route("/test-failure", fail)
    caplog.set_level(logging.ERROR)
    caplog.handler.setFormatter(TextFormatter())

    response = client_no_raise.get("/test-failure")

    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "INTERNAL_ERROR",
            "message": "A temporary error occurred.",
            "details": None,
            "requestId": response.headers["X-Request-ID"],
        }
    }
    assert "secret-detail" not in response.text
    assert all("secret-detail" not in caplog.handler.format(record) for record in caplog.records)
    assert (
        len([record for record in caplog.records if record.getMessage() == "unhandled_error"]) == 1
    )


def test_health_endpoint_returns_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
