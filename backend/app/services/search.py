import logging
import time

from app.ai.protocols import AIUnavailableError, ClothingAnalyzer
from app.ai.schemas import COLOR_VOCABULARY, SearchInterpretation
from app.core.config import Settings
from app.core.db import Db
from app.domain.enums import ClothingCategory, ClothingStatus, Ownership
from app.domain.errors import AIUnavailableAppError, NotFoundError
from app.models.clothing import Clothing as ClothingModel
from app.models.clothing_analysis import ClothingAnalysis as ClothingAnalysisModel
from app.models.participant import Participant
from app.repositories import clothing as clothing_repo
from app.repositories import clothing_analysis as analysis_repo
from app.repositories import event as event_repo
from app.repositories import photo as photo_repo
from app.schemas.clothing import Measurements
from app.schemas.search import (
    MAX_KEYWORD_LENGTH,
    MeasurementRange,
    SearchConditions,
    SearchResultItem,
    SearchResults,
)
from app.services.clothing import ClothingService, _to_analysis_schema

logger = logging.getLogger(__name__)

_MEASUREMENT_ATTRS = {
    (field.alias or name): f"measure_{name}" for name, field in Measurements.model_fields.items()
}


def condition_count(conditions: SearchConditions) -> int:
    return (
        len(set(conditions.colors)) + len(conditions.measurements) + len(set(conditions.keywords))
    )


_VALID_CATEGORIES = frozenset(item.value for item in ClothingCategory)
_VALID_MEASUREMENTS = set(_MEASUREMENT_ATTRS.keys())


def to_search_conditions(raw: SearchInterpretation) -> SearchConditions:
    unrecognized: list[str] = []

    def _add(value: str) -> None:
        cleaned = value.strip()
        if cleaned and cleaned not in unrecognized:
            unrecognized.append(cleaned)

    for phrase in raw.unrecognized:
        _add(phrase)
    category: ClothingCategory | None = None
    if raw.category is not None:
        stripped = raw.category.strip()
        if stripped:
            lowered = stripped.lower()
            if lowered in _VALID_CATEGORIES:
                category = ClothingCategory(lowered)
            else:
                _add(stripped)
    colors: list[str] = []
    seen_colors: set[str] = set()
    for color in raw.colors:
        stripped = color.strip()
        if not stripped:
            continue
        lowered = stripped.lower()
        if lowered in COLOR_VOCABULARY:
            if lowered not in seen_colors:
                seen_colors.add(lowered)
                colors.append(lowered)
        else:
            _add(stripped)
    measurements: dict[str, MeasurementRange] = {}
    for item in raw.measurements:
        name = item.name.strip()
        if not name:
            continue
        if name not in _VALID_MEASUREMENTS:
            _add(name)
            continue
        minimum, maximum = item.min, item.max
        if (
            isinstance(minimum, bool)
            or isinstance(maximum, bool)
            or not isinstance(minimum, (int, float))
            or not isinstance(maximum, (int, float))
        ):
            continue
        min_value, max_value = float(minimum), float(maximum)
        if not (0 < min_value <= 120 and 0 < max_value <= 120):
            continue
        if min_value > max_value:
            continue
        if min_value == max_value:
            min_value = max(min_value - 1, 0.1)
            max_value = min(max_value + 1, 120)
        measurements[name] = MeasurementRange(min=min_value, max=max_value)
    keywords = list(
        dict.fromkeys(
            cleaned
            for cleaned in (keyword.strip().lower() for keyword in raw.keywords)
            if 0 < len(cleaned) <= MAX_KEYWORD_LENGTH
        )
    )
    return SearchConditions(
        category=category,
        colors=colors,
        measurements=measurements,
        keywords=keywords,
        unrecognized=unrecognized,
    )


def _keyword_text(clothing: ClothingModel, analysis: ClothingAnalysisModel | None) -> str:
    parts: list[object] = [clothing.title, clothing.description]
    if (
        analysis is not None
        and analysis.status == "done"
        and analysis.content_version == clothing.content_version
        and isinstance(analysis.features, dict)
    ):
        features = analysis.features
        parts += [features.get("pattern"), features.get("material_estimate")]
        for key in ("style_tags", "visible_details"):
            if isinstance(features.get(key), list):
                parts += features[key]
    return " ".join(part for part in parts if isinstance(part, str)).lower()


def rank(
    candidates: list[tuple[ClothingModel, ClothingAnalysisModel | None]],
    conditions: SearchConditions,
) -> list[tuple[ClothingModel, int, bool]]:
    colors = list(dict.fromkeys(conditions.colors))
    keywords = list(dict.fromkeys(conditions.keywords))
    measurements = conditions.measurements
    filtered = [
        (clothing, analysis)
        for clothing, analysis in candidates
        if conditions.category is None or clothing.category == conditions.category
    ]
    scored: list[tuple[ClothingModel, int, bool]] = []
    for clothing, analysis in filtered:
        score = 0
        if (
            colors
            and analysis is not None
            and analysis.status == "done"
            and (analysis.content_version == clothing.content_version)
        ):
            features = analysis.features if isinstance(analysis.features, dict) else {}
            available = features.get("colors")
            available_set = set(available) if isinstance(available, list) else set()
            score += sum(1 for color in colors if color in available_set)
        if keywords:
            # shortcut: substring match ("coat" also hits "coating"); upgrade to tokens if noisy.
            text = _keyword_text(clothing, analysis)
            score += sum(1 for keyword in keywords if keyword in text)
        missing = False
        if measurements:
            hits = 0
            has_any = False
            for name, bounds in measurements.items():
                value = getattr(clothing, _MEASUREMENT_ATTRS.get(name, ""), None)
                if value is None:
                    continue
                has_any = True
                if (bounds.min is None or value >= bounds.min) and (
                    bounds.max is None or value <= bounds.max
                ):
                    hits += 1
            score += hits
            missing = not has_any
        scored.append((clothing, score, missing))
    scored.sort(key=lambda item: (-item[1], item[2]))
    return scored


class SearchService:
    def __init__(self, db: Db, settings: Settings) -> None:
        self.db = db
        self.settings = settings

    def search(
        self, event_id: str, participant: Participant, conditions: SearchConditions
    ) -> SearchResults:
        builder = ClothingService(self.db, self.settings)
        with self.db.read() as s:
            event = event_repo.get(s, event_id)
            if event is None or participant.event_id != event.id:
                raise NotFoundError()
            rows = clothing_repo.list_visible(
                s, event.id, participant.id, Ownership.OTHERS, [ClothingStatus.AVAILABLE]
            )
            ids = [clothing.id for clothing, _, _ in rows]
            analyses = analysis_repo.analyses_for(s, ids)
            photo_map = photo_repo.photos_for(s, ids)
            meta = {clothing.id: (display, organizer) for clothing, display, organizer in rows}
            ranked = rank(
                [(clothing, analyses.get(clothing.id)) for clothing, _, _ in rows],
                conditions,
            )
            items = [
                SearchResultItem(
                    clothing=builder._build_response(
                        clothing,
                        owner_display_name=meta[clothing.id][0],
                        organizer_participant_id=meta[clothing.id][1],
                        viewer_id=participant.id,
                        photos=photo_map.get(clothing.id, []),
                        analysis=_to_analysis_schema(analyses.get(clothing.id)),
                    ),
                    match_count=score,
                    missing_measurements=missing,
                )
                for clothing, score, missing in ranked
            ]
        return SearchResults(items=items, condition_count=condition_count(conditions))

    def interpret(
        self,
        event_id: str,
        participant: Participant,
        text: str,
        analyzer: ClothingAnalyzer,
    ) -> SearchConditions:
        with self.db.read() as s:
            event = event_repo.get(s, event_id)
            if event is None or participant.event_id != event.id:
                raise NotFoundError()
        start = time.perf_counter()
        try:
            raw = analyzer.interpret_search(text)
        except AIUnavailableError as exc:
            latency_ms = int((time.perf_counter() - start) * 1000)
            logger.warning(
                "ai_call_failed",
                extra={
                    "task": "search_interpretation",
                    "reason": type(exc).__name__,
                    "latency_ms": latency_ms,
                },
            )
            raise AIUnavailableAppError() from exc
        return to_search_conditions(raw)
