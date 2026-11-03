"""Analyzer interface, request type, and shared error (018)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from app.ai.schemas import AnalysisResult


class AnalysisRequest(BaseModel):
    """Input to ClothingAnalyzer.analyze: photo data URLs + owner fields."""

    model_config = ConfigDict(extra="forbid")

    images: list[str] = Field(default_factory=list, max_length=3)
    category: str = ""
    title: str = ""
    description: str = ""
    measurements: dict[str, float | None] = Field(default_factory=dict)


class AIUnavailableError(RuntimeError):
    """Model call failed after retries (job marks the analysis failed)."""


class ClothingAnalyzer(Protocol):
    def analyze(self, request: AnalysisRequest) -> AnalysisResult: ...
