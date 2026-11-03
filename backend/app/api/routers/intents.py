from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response
from fastapi.security import HTTPAuthorizationCredentials

from app.api.deps import (
    DbDep,
    SettingsDep,
    bearer_scheme,
    get_current_participant,
    get_token_participant,
)
from app.api.errors import error_responses
from app.schemas.intent import Intent, IntentCreate, IntentList
from app.schemas.proposal import Proposal
from app.services.intent import IntentService

router = APIRouter(tags=["intents"])

DirectionFilter = Literal["sent", "received"]
StatusFilter = Literal["active", "withdrawn", "declined", "invalidated"]


@router.post(
    "/events/{event_id}/intents",
    operation_id="registerIntent",
    summary="Register an exchange request",
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        201: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(401, 403, 404, 409, 422, 500),
    },
)
def register_intent(
    event_id: str,
    body: IntentCreate,
    response: Response,
    db: DbDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> Intent:
    participant = get_current_participant(event_id, db, credentials)
    result, created = IntentService(db, settings).register(event_id, participant, body)
    response.status_code = 201 if created else 200
    return result


@router.get(
    "/events/{event_id}/intents",
    operation_id="listIntents",
    summary="List sent or received requests",
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(401, 404, 422, 500),
    },
)
def list_intents(
    event_id: str,
    db: DbDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    direction: Annotated[DirectionFilter, Query()] = "sent",
    status: Annotated[list[StatusFilter] | None, Query()] = None,
    wanted_clothing_id: Annotated[str | None, Query(alias="wantedClothingId")] = None,
) -> IntentList:
    participant = get_current_participant(event_id, db, credentials)
    statuses: list[str] = list(status) if status is not None else ["active"]
    return IntentService(db, settings).list_intents(
        event_id, participant, direction, statuses, wanted_clothing_id
    )


@router.delete(
    "/intents/{intent_id}",
    operation_id="withdrawIntent",
    summary="Withdraw a sent request",
    status_code=204,
    responses={
        204: {
            "description": "Request withdrawn",
            "headers": {
                "X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}
            },
        },
        **error_responses(401, 403, 404, 409, 500),
    },
)
def withdraw_intent(
    intent_id: str,
    db: DbDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> None:
    participant = get_token_participant(db, credentials)
    IntentService(db, settings).withdraw(participant, intent_id)
    return None


@router.post(
    "/intents/{intent_id}/accept",
    operation_id="acceptIntent",
    summary="Accept an exchange request",
    response_model=Proposal,
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(401, 403, 404, 409, 500),
    },
)
def accept_intent(
    intent_id: str,
    db: DbDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> Proposal:
    participant = get_token_participant(db, credentials)
    return IntentService(db, settings).accept(participant, intent_id)


@router.post(
    "/intents/{intent_id}/decline",
    operation_id="declineIntent",
    summary="Decline an exchange request",
    response_model=Intent,
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(401, 403, 404, 409, 500),
    },
)
def decline_intent(
    intent_id: str,
    db: DbDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> Intent:
    participant = get_token_participant(db, credentials)
    return IntentService(db, settings).decline(participant, intent_id)
