"""Request and response models for AI search."""

from pydantic import Field

from app.domain.enums import ClothingCategory
from app.schemas.clothing import Clothing
from app.schemas.common import ApiModel


class MeasurementRange(ApiModel):
    min: float | None = None
    max: float | None = None


class SearchConditions(ApiModel):
    category: ClothingCategory | None = None
    colors: list[str] = Field(default_factory=list)
    measurements: dict[str, MeasurementRange] = Field(default_factory=dict)
    unrecognized: list[str] = Field(default_factory=list)


class SearchInterpretationRequest(ApiModel):
    text: str = Field(min_length=1, max_length=200)


class SearchResultItem(ApiModel):
    clothing: Clothing
    match_count: int
    missing_measurements: bool


class SearchResults(ApiModel):
    items: list[SearchResultItem]
    condition_count: int
    next_cursor: None = None
