from app.domain.enums import EventStatus
from app.schemas.common import ApiModel, UtcDatetime


class EventCreate(ApiModel):
    name: str
    organizer_display_name: str


class EventMe(ApiModel):
    participant_id: str
    display_name: str
    is_organizer: bool


class EventStats(ApiModel):
    participant_count: int
    available_clothing_count: int
    confirmed_exchange_count: int


class EventRead(ApiModel):
    id: str
    name: str
    status: EventStatus
    entry_code: str
    entry_url: str
    organizer_participant_id: str
    created_at: UtcDatetime
    closed_at: UtcDatetime | None
    me: EventMe
    stats: EventStats | None


class EventSession(ApiModel):
    event: EventRead
    participant_token: str
