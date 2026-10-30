from pydantic import Field, field_validator

from app.domain.enums import ClothingStatus
from app.schemas.common import ApiModel, UtcDatetime


class ClothingCreate(ApiModel):
    photo_ids: list[str] = Field(min_length=1, max_length=10)
    description: str = Field(min_length=1, max_length=1000)

    @field_validator("photo_ids", mode="after")
    @classmethod
    def _no_duplicate_photo_ids(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("Duplicate photo IDs are not allowed.")
        return value


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
    photos: list[ClothingPhoto]
    description: str
    status: ClothingStatus
    content_version: int
    analysis: None = None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class ClothingList(ApiModel):
    items: list[Clothing]
    next_cursor: None = None
