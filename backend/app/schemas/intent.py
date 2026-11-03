from app.domain.enums import ClothingCategory, ClothingStatus
from app.schemas.common import ApiModel, UtcDatetime


class IntentOwner(ApiModel):
    participant_id: str
    display_name: str
    is_organizer: bool


class ClothingSummary(ApiModel):
    id: str
    owner: IntentOwner
    photo_url: str
    category: ClothingCategory
    title: str
    description: str
    status: ClothingStatus
    content_version: int


class IntentCreate(ApiModel):
    offered_clothing_id: str
    wanted_clothing_id: str


class Intent(ApiModel):
    id: str
    event_id: str
    participant_id: str
    offered_clothing: ClothingSummary
    wanted_clothing: ClothingSummary
    status: str
    accepted_proposal_id: str | None = None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class IntentList(ApiModel):
    items: list[Intent]
    next_cursor: None = None
