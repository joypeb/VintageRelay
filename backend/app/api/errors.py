import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from pydantic.alias_generators import to_camel
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse

from app.core.logging import request_id_var
from app.domain.errors import AppError, InternalError
from app.schemas.common import ValidationReason
from app.schemas.error import ErrorResponse

logger = logging.getLogger(__name__)
_HTTP_CODES = {400: "BAD_REQUEST", 401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND"}
ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    status: {
        "model": ErrorResponse,
        "description": description,
        "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}},
    }
    for status, description in (
        (400, "Malformed request."),
        (422, "Field validation failed."),
        (500, "A temporary error occurred."),
    )
}


def _body(code: str, message: str, details: object = None) -> dict[str, object]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or None,
            "requestId": request_id_var.get(),
        }
    }


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(_body(exc.code, exc.message, exc.details), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        if any(error["type"] == "json_invalid" or error["loc"] == ("body",) for error in errors):
            return JSONResponse(
                _body("BAD_REQUEST", "Unable to process this request."), status_code=400
            )

        fields: list[dict[str, str]] = []
        seen_fields: set[str] = set()
        for error in errors:
            error_type = error["type"]
            field = str(error["loc"][-1])
            if error_type == "extra_forbidden":
                reason = ValidationReason.UNKNOWN_FIELD
            else:
                field = to_camel(field)
                if error_type in {"missing", "string_too_short"} or error.get("input") is None:
                    reason = ValidationReason.REQUIRED
                elif error_type == "string_too_long":
                    reason = ValidationReason.TOO_LONG
                elif error_type == "string_type":
                    reason = ValidationReason.INVALID_TYPE
                elif error_type == "invalid_characters":
                    reason = ValidationReason.INVALID_CHARACTERS
                else:
                    reason = ValidationReason.INVALID
            if field not in seen_fields:
                fields.append({"field": field, "reason": reason.value})
                seen_fields.add(field)
        return JSONResponse(
            _body("VALIDATION_ERROR", "Please check your input.", {"fields": fields}),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            _body(
                _HTTP_CODES.get(exc.status_code, "BAD_REQUEST"), "Unable to process this request."
            ),
            status_code=exc.status_code,
        )

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_error", extra={"path": request.url.path})
        return JSONResponse(
            _body(InternalError.code, InternalError.message), status_code=InternalError.status_code
        )
