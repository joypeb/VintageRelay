"""Validated result schema for background clothing analysis (018).

Flat, strict (extra keys rejected). Field-level issues clamp instead of
failing: unknown colors dropped, tags/details truncated, messages capped,
empty strings dropped.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

COLOR_VOCABULARY = frozenset(
    {
        "black",
        "white",
        "gray",
        "beige",
        "brown",
        "red",
        "orange",
        "yellow",
        "green",
        "blue",
        "navy",
        "purple",
        "pink",
        "multicolor",
    }
)

Pattern = Literal["solid", "striped", "checked", "floral", "graphic", "other"]
Aspect = Literal["condition", "size", "fit", "material", "logo", "color", "other"]

MAX_TAGS = 8
MAX_DETAILS = 8
MAX_MESSAGE_LENGTH = 200


def _clean_str_list(value: object, limit: int | None) -> object:
    if not isinstance(value, list):
        return value
    cleaned = [item.strip() for item in value if isinstance(item, str) and item.strip()]
    return cleaned[:limit] if limit is not None else cleaned


class SearchMeasurement(BaseModel):
    """One raw measurement range from search text (inches)."""

    model_config = ConfigDict(extra="forbid")

    name: str
    min: float
    max: float


class SearchInterpretation(BaseModel):
    """Raw validated model output for search text; strict schema sent."""

    model_config = ConfigDict(extra="forbid")

    category: str | None
    colors: list[str]
    measurements: list[SearchMeasurement]
    keywords: list[str]
    unrecognized: list[str]


class Uncertainty(BaseModel):
    model_config = ConfigDict(extra="forbid")

    aspect: Aspect
    message: str

    @field_validator("message", mode="before")
    @classmethod
    def _truncate_message(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return value.strip()[:MAX_MESSAGE_LENGTH]


class AnalysisResult(BaseModel):
    """Flat validated model output; single source for the json_schema sent."""

    model_config = ConfigDict(extra="forbid")

    colors: list[str]
    pattern: Pattern | None
    material_estimate: str | None
    style_tags: list[str]
    visible_details: list[str]
    size_label: str | None
    uncertainties: list[Uncertainty]

    @field_validator("colors", mode="before")
    @classmethod
    def _drop_unknown_colors(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        kept = [
            color.strip().lower()
            for color in value
            if isinstance(color, str) and color.strip().lower() in COLOR_VOCABULARY
        ]
        return kept[:3]

    @field_validator("style_tags", mode="before")
    @classmethod
    def _clean_style_tags(cls, value: object) -> object:
        return _clean_str_list(value, MAX_TAGS)

    @field_validator("visible_details", mode="before")
    @classmethod
    def _clean_visible_details(cls, value: object) -> object:
        return _clean_str_list(value, MAX_DETAILS)

    @field_validator("uncertainties", mode="before")
    @classmethod
    def _drop_empty_uncertainties(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        return [
            item
            for item in value
            if not (
                isinstance(item, dict)
                and (not isinstance(item.get("message"), str) or not item["message"].strip())
            )
        ]

    @field_validator("material_estimate", "size_label", mode="before")
    @classmethod
    def _empty_to_none(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            return value.strip() or None
        return value
