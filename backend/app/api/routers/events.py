from fastapi import APIRouter

from app.api.deps import CurrentParticipant, EventServiceDep
from app.api.errors import ERROR_RESPONSES, error_responses
from app.schemas.event import EventCreate, EventRead, EventSession

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


@router.get(
    "/{event_id}",
    summary="Read an event",
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(401, 404, 500),
    },
)
def read_event(event_id: str, me: CurrentParticipant, service: EventServiceDep) -> EventRead:
    return service.get(me, event_id)
