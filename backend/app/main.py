from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.api.errors import register_error_handlers
from app.core.config import Settings, get_settings
from app.core.db import Db
from app.core.logging import request_context, setup_logging


def create_app(settings: Settings | None = None, db: Db | None = None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
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

    app.include_router(api_router)
    return app


app = create_app()
