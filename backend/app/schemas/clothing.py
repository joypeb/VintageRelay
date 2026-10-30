from typing import Any

from pydantic import Field, ValidationError, field_validator, model_validator
from pydantic_core import InitErrorDetails, PydanticCustomError

from app.domain.enums import ClothingCategory, ClothingStatus
from app.schemas.common import ApiModel, UtcDatetime, reject_control_characters


class Measurements(ApiModel):
    total_length: float | None = Field(default=None, gt=0, le=120)
    chest: float | None = Field(default=None, gt=0, le=120)
    shoulder: float | None = Field(default=None, gt=0, le=120)
    sleeve: float | None = Field(default=None, gt=0, le=120)
    waist: float | None = Field(default=None, gt=0, le=120)
    hem: float | None = Field(default=None, gt=0, le=120)
    inseam: float | None = Field(default=None, gt=0, le=120)
    thigh: float | None = Field(default=None, gt=0, le=120)


_TOP_MEASUREMENTS = frozenset({"total_length", "chest", "shoulder", "sleeve"})
_BOTTOM_MEASUREMENTS = frozenset({"total_length", "waist", "hem", "inseam", "thigh"})
_MEASUREMENT_FIELDS = frozenset(Measurements.model_fields)
_MEASUREMENT_ALIASES = {
    (field.alias or name): name for name, field in Measurements.model_fields.items()
}
_VALID_CATEGORIES = frozenset(item.value for item in ClothingCategory)


def _invalid(message: str, loc: tuple[str, ...], value: Any) -> InitErrorDetails:
    return InitErrorDetails(type=PydanticCustomError("value_error", message), loc=loc, input=value)


def _unknown_field(loc: tuple[str, ...], value: Any) -> InitErrorDetails:
    return InitErrorDetails(
        type=PydanticCustomError("extra_forbidden", "Extra inputs are not permitted."),
        loc=loc,
        input=value,
    )


class ClothingCreate(ApiModel):
    photo_ids: list[str] = Field(min_length=1, max_length=10)
    category: ClothingCategory
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=1000)
    measurements: Measurements | None = None

    @field_validator("photo_ids", mode="after")
    @classmethod
    def _no_duplicate_photo_ids(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("Duplicate photo IDs are not allowed.")
        return value

    @field_validator("title", mode="after")
    @classmethod
    def _reject_title_control_characters(cls, value: str) -> str:
        return reject_control_characters(value)

    @model_validator(mode="before")
    @classmethod
    def _validate_measurements(cls, data: Any) -> Any:
        # Runs before nested validation so group/range violations carry dotted
        # locs (measurements.<name>); a plain ValueError here would surface as a
        # body-level 400 instead of the 422 contract.
        if not isinstance(data, dict):
            return data
        measurements = data.get("measurements")
        if measurements is None:
            return data
        if not isinstance(measurements, dict):
            return data
        if not measurements:
            return {**data, "measurements": None}
        category = data.get("category")
        category_valid = category in _VALID_CATEGORIES
        details: list[InitErrorDetails] = []
        if category == ClothingCategory.OTHER.value:
            details.append(
                _invalid(
                    "Measurements are not allowed for this category.",
                    ("measurements",),
                    measurements,
                )
            )
        else:
            allowed = (
                _TOP_MEASUREMENTS
                if category != ClothingCategory.BOTTOM.value
                else _BOTTOM_MEASUREMENTS
            )
            for key, value in measurements.items():
                field_name = key if key in _MEASUREMENT_FIELDS else _MEASUREMENT_ALIASES.get(key)
                safe_input = value if value is not None else measurements
                if field_name is None:
                    details.append(_unknown_field((f"measurements.{key}",), safe_input))
                    continue
                if category_valid and field_name not in allowed:
                    details.append(
                        _invalid(
                            "Measurement does not belong to this category.",
                            (f"measurements.{key}",),
                            safe_input,
                        )
                    )
                    continue
                if value is not None and _is_valid_measurement(value):
                    continue
                details.append(
                    _invalid(
                        "Measurement must be a number greater than 0 and at most 120.",
                        (f"measurements.{key}",),
                        safe_input,
                    )
                )
        if details and not category_valid:
            if "category" not in data:
                details.append(InitErrorDetails(type="missing", loc=("category",), input=data))
            else:
                details.append(_invalid("Invalid category.", ("category",), category))
        if details:
            raise ValidationError.from_exception_data("ClothingCreate", details)
        if all(value is None for value in measurements.values()):
            return {**data, "measurements": None}
        return data


def _is_valid_measurement(value: Any) -> bool:
    if isinstance(value, (bool, str)):
        return False
    if isinstance(value, (int, float)):
        return 0 < value <= 120
    return False


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
    category: ClothingCategory
    title: str
    measurements: Measurements | None
    status: ClothingStatus
    content_version: int
    analysis: None = None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class ClothingList(ApiModel):
    items: list[Clothing]
    next_cursor: None = None
