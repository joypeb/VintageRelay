import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import APIRouter, FastAPI
from fastapi.openapi.utils import get_openapi
from starlette.middleware.cors import CORSMiddleware

from app.api.errors import register_error_handlers
from app.api.routers import entry_codes, events, photos
from app.core.config import Settings, get_settings
from app.core.db import Db
from app.core.logging import disable_access_log, request_context, setup_logging


def create_app(settings: Settings | None = None, db: Db | None = None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        disable_access_log()
        os.makedirs(settings.photo_dir, exist_ok=True)
        if db is not None:
            yield
            return
        database = Db(settings.database_url)
        app.state.db = database
        try:
            yield
        finally:
            database.dispose()

    app = FastAPI(title="Vintage Relay API", lifespan=lifespan)
    app.state.settings = settings
    if db is not None:
        app.state.db = db
    register_error_handlers(app)
    app.middleware("http")(request_context)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.app_base_url],
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        allow_credentials=False,
    )
    api_router = APIRouter(prefix="/api/v1")

    @api_router.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    api_router.include_router(events.router)
    api_router.include_router(entry_codes.router)
    api_router.include_router(photos.router)
    app.include_router(api_router)

    def custom_openapi() -> dict[str, Any]:
        if app.openapi_schema is not None:
            return app.openapi_schema
        schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
        # These bodyless operations have no validated parameters; preserve real 422s.
        for path, method in (
            ("/api/v1/entry-codes/{entry_code}", "get"),
            ("/api/v1/events/{event_id}", "get"),
            ("/api/v1/events/{event_id}/close", "post"),
            ("/api/v1/photos/{photo_id}", "get"),
        ):
            responses = schema["paths"][path][method]["responses"]
            validation_ref = (
                responses.get("422", {})
                .get("content", {})
                .get("application/json", {})
                .get("schema", {})
                .get("$ref", "")
            )
            if validation_ref.endswith("/HTTPValidationError"):
                del responses["422"]
        schemas = schema.get("components", {}).get("schemas", {})
        for name in ("HTTPValidationError", "ValidationError"):
            component = schemas.pop(name, None)
            if component is not None and f'"#/components/schemas/{name}"' in json.dumps(schema):
                schemas[name] = component
        app.openapi_schema = schema
        return schema

    app.openapi = custom_openapi  # type: ignore[method-assign]  # FastAPI's schema override hook.
    return app


app = create_app()
