from fastapi import APIRouter

from app.api.deps import EventServiceDep
from app.api.errors import ERROR_RESPONSES
from app.schemas.event import EventCreate, EventSession

router = APIRouter(prefix="/events", tags=["events"])


@router.post(
    "",
    status_code=201,
    summary="Create an event",
    responses={
        201: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **ERROR_RESPONSES,
    },
)
def create_event(body: EventCreate, service: EventServiceDep) -> EventSession:
    return service.create(body)
