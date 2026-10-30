from pydantic import Field

from app.domain.enums import ClothingStatus
from app.schemas.common import ApiModel, UtcDatetime


class ClothingCreate(ApiModel):
    photo_id: str
    description: str = Field(min_length=1, max_length=1000)


class ClothingOwner(ApiModel):
    participant_id: str
    display_name: str
    is_organizer: bool


class ClothingPhoto(ApiModel):
    id: str
    url: str


class Clothing(ApiModel):
    id: str
    event_id: str
    owner: ClothingOwner
    is_mine: bool
    photo: ClothingPhoto
    description: str
    status: ClothingStatus
    content_version: int
    analysis: None = None
    created_at: UtcDatetime
    updated_at: UtcDatetime
