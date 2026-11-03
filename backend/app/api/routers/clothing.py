from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials

from app.api.deps import DbDep, SettingsDep, TokenParticipant, bearer_scheme, get_token_participant
from app.api.errors import error_responses
from app.schemas.clothing import Clothing, ClothingUpdate
from app.services.clothing import ClothingService

router = APIRouter(prefix="/clothing", tags=["clothing"])


@router.get(
    "/{clothing_id}",
    operation_id="getClothing",
    summary="Read one garment",
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(401, 404, 500),
    },
)
def get_clothing(
    clothing_id: str, participant: TokenParticipant, db: DbDep, settings: SettingsDep
) -> Clothing:
    return ClothingService(db, settings).get(participant, clothing_id)


@router.patch(
    "/{clothing_id}",
    operation_id="editClothing",
    summary="Edit a garment",
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(401, 403, 404, 409, 422, 500),
    },
)
def edit_clothing(
    clothing_id: str,
    body: ClothingUpdate,
    db: DbDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> Clothing:
    participant = get_token_participant(db, credentials)
    return ClothingService(db, settings).edit(participant, clothing_id, body)


@router.delete(
    "/{clothing_id}",
    operation_id="withdrawClothing",
    summary="Withdraw a garment",
    status_code=204,
    responses={
        204: {
            "description": "Garment withdrawn",
            "headers": {
                "X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}
            },
        },
        **error_responses(401, 403, 404, 409, 500),
    },
)
def withdraw_clothing(
    clothing_id: str,
    participant: TokenParticipant,
    db: DbDep,
    settings: SettingsDep,
) -> None:
    ClothingService(db, settings).withdraw(participant, clothing_id)
    return None
