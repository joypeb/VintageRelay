from fastapi import APIRouter

from app.api.deps import CurrentParticipant, EventServiceDep, Organizer
from app.api.errors import ERROR_RESPONSES, error_responses
from app.schemas.event import EventCreate, EventRead, EventSession, ParticipantCreate

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


@router.post(
    "/{event_id}/participants",
    status_code=201,
    operation_id="joinEvent",
    summary="Join an event with its entry code",
    responses={
        201: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(400, 404, 409, 422, 500),
    },
)
def join_event(event_id: str, body: ParticipantCreate, service: EventServiceDep) -> EventSession:
    return service.join(event_id, body)


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


@router.post(
    "/{event_id}/close",
    summary="Close an event",
    operation_id="closeEvent",
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(401, 403, 404, 500),
    },
)
def close_event(event_id: str, me: Organizer, service: EventServiceDep) -> EventRead:
    return service.close(me, event_id)
