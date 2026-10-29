import json
import logging
import sys
import time
import traceback
from contextvars import ContextVar
from datetime import UTC, datetime
from types import TracebackType
from typing import override
from uuid import uuid4

from starlette.middleware.base import RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import Settings

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
SENSITIVE_KEYS = {"authorization", "cookie", "token", "session", "api_key", "entry_code", "image"}
_RESERVED = set(vars(logging.makeLogRecord({}))) | {"message", "asctime"}
_HANDLER_NAME = "vintage_relay_stdout"
_ENTRY_CODE_PATH_PREFIX = "/api/v1/entry-codes/"
_ENTRY_CODE_VISIBLE_LENGTH = 2
logger = logging.getLogger(__name__)


async def request_context(request: Request, call_next: RequestResponseEndpoint) -> Response:
    rid = request.headers.get("X-Request-ID") or uuid4().hex
    token = request_id_var.set(rid)
    start = time.perf_counter()
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        logger.info(
            "request",
            extra={
                "method": request.method,
                "path": mask_path(request.url.path),
                "status": response.status_code,
                "ms": round((time.perf_counter() - start) * 1000),
            },
        )
        return response
    except Exception:
        logger.exception("unhandled_error", extra={"path": mask_path(request.url.path)})
        return JSONResponse(
            {
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "A temporary error occurred.",
                    "details": None,
                    "requestId": rid,
                }
            },
            status_code=500,
            headers={"X-Request-ID": rid},
        )
    finally:
        request_id_var.reset(token)


def mask_path(path: str) -> str:
    if not path.startswith(_ENTRY_CODE_PATH_PREFIX):
        return path
    code, separator, suffix = path[len(_ENTRY_CODE_PATH_PREFIX) :].partition("/")
    if not code:
        return path
    visible = code[:_ENTRY_CODE_VISIBLE_LENGTH] if len(code) > _ENTRY_CODE_VISIBLE_LENGTH else ""
    return f"{_ENTRY_CODE_PATH_PREFIX}{visible}****{separator}{suffix}"


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
            # Source lines can contain secrets even when exception messages are omitted.
            rendered.extend(
                frame.split("\n", 1)[0] for frame in traceback.format_tb(exception.__traceback__)
            )
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


def disable_access_log() -> None:
    logging.getLogger("uvicorn.access").disabled = True


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
    disable_access_log()
