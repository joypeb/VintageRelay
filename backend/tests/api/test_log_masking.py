import asyncio
import logging
import logging.config

import pytest
import uvicorn.config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.core.config import Settings
from app.core.db import Db
from app.core.logging import JsonFormatter, TextFormatter
from app.main import create_app


def assert_masked_log(caplog: pytest.LogCaptureFixture, event: str, path: str) -> None:
    records = [record for record in caplog.records if record.name.startswith("app.")]
    matching = [record for record in records if record.getMessage() == event]

    assert matching, f"Expected application log {event!r}"
    assert all(record.path == path for record in matching)
    for record in records:
        for formatter in (JsonFormatter(), TextFormatter()):
            assert "K7P3QX" not in formatter.format(record)


def test_request_log_masks_entry_code(client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)

    response = client.get("/api/v1/entry-codes/K7P3QX")

    assert response.status_code == 404
    assert_masked_log(caplog, "request", "/api/v1/entry-codes/K7****")


def test_middleware_unhandled_error_log_masks_entry_code(
    app: FastAPI, client_no_raise: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    def fail(code: str) -> None:
        raise RuntimeError("failure")

    app.add_api_route("/api/v1/entry-codes/{code}/fail", fail, methods=["GET"])
    caplog.set_level(logging.ERROR)

    response = client_no_raise.get("/api/v1/entry-codes/K7P3QX/fail")

    assert response.status_code == 500
    assert_masked_log(caplog, "unhandled_error", "/api/v1/entry-codes/K7****/fail")


def test_registered_unhandled_error_log_masks_entry_code(
    app: FastAPI, caplog: pytest.LogCaptureFixture
) -> None:
    request = Request(
        {"type": "http", "method": "GET", "path": "/api/v1/entry-codes/K7P3QX", "headers": []}
    )
    caplog.set_level(logging.ERROR)

    response = asyncio.run(app.exception_handlers[Exception](request, RuntimeError("failure")))

    assert response.status_code == 500
    assert_masked_log(caplog, "unhandled_error", "/api/v1/entry-codes/K7****")


def test_lifespan_disables_access_log_after_uvicorn_logging_configuration(
    settings: Settings, db: Db
) -> None:
    root = logging.getLogger()
    original_handlers = root.handlers[:]
    original_level = root.level
    loggers = [logging.getLogger(name) for name in ("uvicorn", "uvicorn.error", "uvicorn.access")]
    states = [
        (logger.disabled, logger.level, logger.propagate, logger.handlers[:]) for logger in loggers
    ]
    try:
        app = create_app(settings, db)
        logging.config.dictConfig(uvicorn.config.LOGGING_CONFIG)
        with TestClient(app):
            assert logging.getLogger("uvicorn.access").disabled is True
    finally:
        root.handlers[:] = original_handlers
        root.setLevel(original_level)
        for logger, (disabled, level, propagate, handlers) in zip(loggers, states, strict=True):
            logger.disabled = disabled
            logger.setLevel(level)
            logger.propagate = propagate
            logger.handlers[:] = handlers
