import json
import logging
import sys
import traceback
from contextvars import ContextVar
from datetime import UTC, datetime
from types import TracebackType
from typing import override

from app.core.config import Settings

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
SENSITIVE_KEYS = {"authorization", "cookie", "token", "session", "api_key", "entry_code", "image"}
_RESERVED = set(vars(logging.makeLogRecord({}))) | {"message", "asctime"}
_HANDLER_NAME = "vintage_relay_stdout"


def mask(data: dict[str, object]) -> dict[str, object]:
    return {
        key: "***" if any(sensitive in key.lower() for sensitive in SENSITIVE_KEYS) else value
        for key, value in data.items()
    }


class JsonFormatter(logging.Formatter):
    @override
    def formatException(
        self,
        ei: tuple[type[BaseException], BaseException, TracebackType | None]
        | tuple[None, None, None],
    ) -> str:
        exception = ei[1]
        seen: set[int] = set()
        rendered: list[str] = []
        while exception is not None and id(exception) not in seen:
            seen.add(id(exception))
            rendered.append(type(exception).__qualname__)
            rendered.extend(traceback.format_tb(exception.__traceback__))
            exception = exception.__cause__ or (
                None if exception.__suppress_context__ else exception.__context__
            )
        return "\n".join(rendered)

    def format(self, record: logging.LogRecord) -> str:
        data: dict[str, object] = {
            key: value for key, value in vars(record).items() if key not in _RESERVED
        }
        data.update(
            ts=datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            level=record.levelname,
            logger=record.name,
            msg=record.getMessage(),
            request_id=request_id_var.get(),
        )
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return json.dumps(mask(data), ensure_ascii=False, default=str)


class TextFormatter(JsonFormatter):
    def format(self, record: logging.LogRecord) -> str:
        data = json.loads(super().format(record))
        prefix = " ".join(str(data.pop(key)) for key in ("ts", "level", "request_id", "msg"))
        return " ".join([prefix, *(f"{key}={value}" for key, value in data.items())])


def setup_logging(settings: Settings) -> None:
    root = logging.getLogger()
    for handler in root.handlers[:]:
        if handler.name == _HANDLER_NAME:
            root.removeHandler(handler)
            handler.close()
    handler = logging.StreamHandler(sys.stdout)
    handler.set_name(_HANDLER_NAME)
    handler.setFormatter(JsonFormatter() if settings.log_format == "json" else TextFormatter())
    root.addHandler(handler)
    root.setLevel(settings.log_level)
    logging.getLogger("uvicorn.access").disabled = True
