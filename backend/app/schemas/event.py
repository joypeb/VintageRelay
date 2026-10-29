from pydantic import Field, field_validator

from app.domain.enums import EventStatus
from app.schemas.common import ApiModel, UtcDatetime, reject_control_characters


class EventCreate(ApiModel):
    name: str = Field(min_length=1, max_length=60)
    organizer_display_name: str = Field(min_length=1, max_length=30)

    @field_validator("name", "organizer_display_name", mode="after")
    @classmethod
    def validate_control_characters(cls, value: str) -> str:
        return reject_control_characters(value)


class EntryCodePreview(ApiModel):
    event_id: str
    name: str
    status: EventStatus


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
