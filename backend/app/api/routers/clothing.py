from fastapi import APIRouter

from app.api.deps import DbDep, SettingsDep, TokenParticipant
from app.api.errors import error_responses
from app.schemas.clothing import Clothing
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
