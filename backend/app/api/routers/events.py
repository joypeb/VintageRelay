from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.security import HTTPAuthorizationCredentials

from app.api.deps import (
    CurrentParticipant,
    DbDep,
    EventServiceDep,
    Organizer,
    SettingsDep,
    bearer_scheme,
    get_current_participant,
)
from app.api.errors import ERROR_RESPONSES, error_responses
from app.domain.enums import ClothingStatus, Ownership
from app.schemas.clothing import Clothing, ClothingCreate, ClothingList
from app.schemas.event import EventCreate, EventRead, EventSession, ParticipantCreate
from app.schemas.photo import Photo
from app.services.clothing import ClothingService
from app.services.photo import PhotoService

router = APIRouter(prefix="/events", tags=["events"])

# Literal (not Ownership) so OpenAPI inlines the enum with its default instead of a $ref.
OwnershipFilter = Literal["mine", "others", "all"]


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


@router.post(
    "/{event_id}/photos",
    status_code=201,
    operation_id="uploadPhoto",
    summary="Upload a clothing photo",
    responses={
        201: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(400, 401, 404, 409, 413, 415, 422, 500),
    },
)
def upload_photo(
    event_id: str,
    request: Request,
    me: CurrentParticipant,
    db: DbDep,
    settings: SettingsDep,
    file: Annotated[UploadFile | None, File()] = None,
) -> Photo:
    if not request.headers.get("content-type", "").lower().startswith("multipart/form-data"):
        raise RequestValidationError(
            [{"loc": ("body",), "msg": "Invalid multipart body.", "type": "value_error"}]
        )
    if file is None or file.size == 0:
        raise RequestValidationError(
            [{"loc": ("body", "file"), "msg": "Field required.", "type": "missing"}]
        )
    return PhotoService(db, settings).upload(event_id, me, file)


@router.post(
    "/{event_id}/clothing",
    status_code=201,
    operation_id="registerClothing",
    summary="Register a garment with an uploaded photo",
    responses={
        201: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(400, 401, 404, 409, 422, 500),
    },
)
def register_clothing(
    event_id: str,
    body: ClothingCreate,
    db: DbDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> Clothing:
    participant = get_current_participant(event_id, db, credentials)
    return ClothingService(db, settings).register(event_id, participant, body)


@router.get(
    "/{event_id}/clothing",
    operation_id="listClothing",
    summary="List garments in the event",
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(401, 404, 422, 500),
    },
)
def list_clothing(
    event_id: str,
    db: DbDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    ownership: Annotated[OwnershipFilter, Query()] = "all",
    status: Annotated[list[ClothingStatus] | None, Query()] = None,
) -> ClothingList:
    participant = get_current_participant(event_id, db, credentials)
    return ClothingService(db, settings).list(event_id, participant, Ownership(ownership), status)
