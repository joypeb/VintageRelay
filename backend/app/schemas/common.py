import unicodedata
from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, PlainSerializer
from pydantic.alias_generators import to_camel
from pydantic_core import PydanticCustomError


class ValidationReason(StrEnum):
    REQUIRED = "required"
    TOO_LONG = "too_long"
    INVALID_TYPE = "invalid_type"
    INVALID_CHARACTERS = "invalid_characters"
    UNKNOWN_FIELD = "unknown_field"
    INVALID = "invalid"


def reject_control_characters(value: str) -> str:
    if any(unicodedata.category(character) == "Cc" for character in value):
        raise PydanticCustomError("invalid_characters", "Control characters are not allowed.")
    return value


def serialize_utc_datetime(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


UtcDatetime = Annotated[datetime, PlainSerializer(serialize_utc_datetime)]


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        from_attributes=True,
        str_strip_whitespace=True,
    )
