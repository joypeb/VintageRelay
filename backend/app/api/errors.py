import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse

from app.core.logging import request_id_var
from app.domain.errors import AppError, InternalError

logger = logging.getLogger(__name__)
_HTTP_CODES = {400: "BAD_REQUEST", 401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND"}


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
        fields = [
            {"field": str(error["loc"][-1]), "reason": error["type"]} for error in exc.errors()
        ]
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
