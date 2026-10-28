import json
import logging
import sys

import pytest
from app.core.config import Settings
from app.core.logging import JsonFormatter, TextFormatter, mask, setup_logging


def test_sensitive_keys_are_masked_and_event_id_is_preserved() -> None:
    data = {
        "AuthorizationHeader": "secret",
        "COOKIE": "secret",
        "participant_token": "secret",
        "session_id": "secret",
        "API_KEY": "secret",
        "entry_code": "secret",
        "image_data": "secret",
        "event_id": "event-1",
    }

    result = mask(data)

    assert result == {key: "***" if key != "event_id" else "event-1" for key in data}


def test_json_formatter_includes_fields_and_masks_extra() -> None:
    record = logging.makeLogRecord(
        {
            "name": "app.services.event",
            "levelno": logging.INFO,
            "levelname": "INFO",
            "msg": "event_created",
            "participant_token": "SECRET123",
            "event_id": "event-1",
        }
    )

    result = json.loads(JsonFormatter().format(record))

    assert {
        "ts",
        "level",
        "logger",
        "msg",
        "request_id",
        "participant_token",
        "event_id",
    } <= result.keys()
    assert result["level"] == "INFO"
    assert result["logger"] == "app.services.event"
    assert result["msg"] == "event_created"
    assert result["participant_token"] == "***"
    assert result["event_id"] == "event-1"


@pytest.mark.parametrize("formatter", [JsonFormatter, TextFormatter])
def test_chained_exceptions_render_frames_without_secrets(
    formatter: type[logging.Formatter],
) -> None:
    key_message = "code=K7P3QX"
    value_message = "token=SECRET123"
    try:
        try:
            raise KeyError(key_message)
        except KeyError as cause:
            raise ValueError(value_message) from cause
    except ValueError:
        record = logging.makeLogRecord(
            {
                "name": "test",
                "levelno": logging.ERROR,
                "levelname": "ERROR",
                "msg": "failure",
                "exc_info": sys.exc_info(),
            }
        )

    result = formatter().format(record)

    assert "ValueError" in result
    assert "KeyError" in result
    assert "test_logging.py" in result
    assert "SECRET123" not in result
    assert "K7P3QX" not in result


def test_setup_logging_called_twice_installs_one_handler_and_propagates() -> None:
    root = logging.getLogger()
    original_handlers = root.handlers[:]
    original_level = root.level
    access = logging.getLogger("uvicorn.access")
    original_access_disabled = access.disabled
    service = logging.getLogger("app.services.event")
    original_propagate = service.propagate
    try:
        setup_logging(Settings(log_format="json"))
        first_added = [handler for handler in root.handlers if handler not in original_handlers]

        setup_logging(Settings(log_format="json"))
        added = [handler for handler in root.handlers if handler not in original_handlers]

        assert len(first_added) == 1
        assert len(added) == 1
        assert isinstance(added[0].formatter, JsonFormatter)
        assert service.propagate is True
    finally:
        for handler in root.handlers[:]:
            if handler not in original_handlers:
                root.removeHandler(handler)
                handler.close()
        root.handlers[:] = original_handlers
        root.setLevel(original_level)
        access.disabled = original_access_disabled
        service.propagate = original_propagate
