from app.core.config import Settings
from app.core.db import Db
from app.domain.enums import ClothingStatus, Ownership
from app.domain.errors import NotFoundError
from app.models.clothing import Clothing as ClothingModel
from app.models.clothing_analysis import ClothingAnalysis as ClothingAnalysisModel
from app.models.participant import Participant
from app.repositories import clothing as clothing_repo
from app.repositories import clothing_analysis as analysis_repo
from app.repositories import event as event_repo
from app.repositories import photo as photo_repo
from app.schemas.clothing import Measurements
from app.schemas.search import SearchConditions, SearchResultItem, SearchResults
from app.services.clothing import ClothingService, _to_analysis_schema

_MEASUREMENT_ATTRS = {
    (field.alias or name): f"measure_{name}" for name, field in Measurements.model_fields.items()
}


def condition_count(conditions: SearchConditions) -> int:
    return len(set(conditions.colors)) + len(conditions.measurements)


def rank(
    candidates: list[tuple[ClothingModel, ClothingAnalysisModel | None]],
    conditions: SearchConditions,
) -> list[tuple[ClothingModel, int, bool]]:
    colors = list(dict.fromkeys(conditions.colors))
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
