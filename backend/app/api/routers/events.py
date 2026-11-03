from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.security import HTTPAuthorizationCredentials

from app.ai.deps import get_analyzer
from app.ai.protocols import ClothingAnalyzer
from app.ai.schemas import COLOR_VOCABULARY
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
from app.domain.enums import ClothingCategory, ClothingStatus, Ownership
from app.schemas.clothing import Clothing, ClothingCreate, ClothingList, Measurements
from app.schemas.event import EventCreate, EventRead, EventSession, ParticipantCreate
from app.schemas.photo import Photo
from app.schemas.search import (
    MAX_KEYWORD_LENGTH,
    MeasurementRange,
    SearchConditions,
    SearchInterpretationRequest,
    SearchResults,
)
from app.services.clothing import ClothingService
from app.services.clothing_analysis import run_clothing_analysis
from app.services.photo import PhotoService
from app.services.search import SearchService

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
    background_tasks: BackgroundTasks,
    db: DbDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    analyzer: Annotated[ClothingAnalyzer, Depends(get_analyzer)],
) -> Clothing:
    participant = get_current_participant(event_id, db, credentials)
    response = ClothingService(db, settings).register(event_id, participant, body)
    background_tasks.add_task(
        run_clothing_analysis, db, settings, analyzer, response.id, response.content_version
    )
    return response


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


_MEASUREMENT_NAMES = [(field.alias or name) for name, field in Measurements.model_fields.items()]


def _parse_search_bound(param: str, raw: str) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError) as err:
        raise RequestValidationError(
            [
                {
                    "loc": ("query", param),
                    "msg": "Invalid number.",
                    "type": "value_error",
                    "input": raw,
                }
            ]
        ) from err
    if not 0 < value <= 120:
        raise RequestValidationError(
            [
                {
                    "loc": ("query", param),
                    "msg": "Must be greater than 0 and at most 120.",
                    "type": "value_error",
                    "input": raw,
                }
            ]
        )
    return value


def parse_search_conditions(
    request: Request,
    category: Annotated[ClothingCategory | None, Query()] = None,
    color: Annotated[list[str] | None, Query()] = None,
    keyword: Annotated[list[str] | None, Query()] = None,
) -> SearchConditions:
    keywords = list(dict.fromkeys(value.strip().lower() for value in keyword or []))
    for value in keywords:
        if not 0 < len(value) <= MAX_KEYWORD_LENGTH:
            raise RequestValidationError(
                [
                    {
                        "loc": ("query", "keyword"),
                        "msg": f"Must be 1 to {MAX_KEYWORD_LENGTH} characters.",
                        "type": "value_error",
                        "input": value,
                    }
                ]
            )
    colors = list(dict.fromkeys(color or []))
    for value in colors:
        if value not in COLOR_VOCABULARY:
            raise RequestValidationError(
                [
                    {
                        "loc": ("query", "color"),
                        "msg": "Invalid color.",
                        "type": "value_error",
                        "input": value,
                    }
                ]
            )
    measurements: dict[str, MeasurementRange] = {}
    for name in _MEASUREMENT_NAMES:
        min_key, max_key = f"{name}Min", f"{name}Max"
        raw_min = request.query_params.get(min_key)
        raw_max = request.query_params.get(max_key)
        if raw_min is None and raw_max is None:
            continue
        parsed_min = _parse_search_bound(min_key, raw_min) if raw_min is not None else None
        parsed_max = _parse_search_bound(max_key, raw_max) if raw_max is not None else None
        if parsed_min is not None and parsed_max is not None and parsed_min > parsed_max:
            raise RequestValidationError(
                [
                    {
                        "loc": ("query", min_key),
                        "msg": "Min must not exceed max.",
                        "type": "value_error",
                        "input": raw_min,
                    }
                ]
            )
        measurements[name] = MeasurementRange(min=parsed_min, max=parsed_max)
    return SearchConditions(
        category=category, colors=colors, measurements=measurements, keywords=keywords
    )


@router.get(
    "/{event_id}/clothing/search",
    operation_id="searchClothing",
    summary="Search garments with manual conditions",
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(401, 404, 422, 500),
    },
)
def search_clothing(
    event_id: str,
    me: CurrentParticipant,
    db: DbDep,
    settings: SettingsDep,
    conditions: Annotated[SearchConditions, Depends(parse_search_conditions)],
) -> SearchResults:
    return SearchService(db, settings).search(event_id, me, conditions)


@router.post(
    "/{event_id}/search/interpretation",
    operation_id="interpretSearch",
    summary="Interpret search text",
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(401, 404, 422, 503, 500),
    },
)
def interpret_search(
    event_id: str,
    body: SearchInterpretationRequest,
    me: CurrentParticipant,
    db: DbDep,
    settings: SettingsDep,
    analyzer: Annotated[ClothingAnalyzer, Depends(get_analyzer)],
) -> SearchConditions:
    return SearchService(db, settings).interpret(event_id, me, body.text, analyzer)
