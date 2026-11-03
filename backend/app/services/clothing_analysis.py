"""Background AI clothing analysis job (018).

Reads the garment and photo bytes, calls the model outside any DB
transaction, then saves with a single conditional write (first done wins).
Failures converge the row to ``failed``; withdrawn or version-changed
results are discarded.
"""

import base64
import logging
import time
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import inspect as sqlalchemy_inspect

from app.ai.protocols import AINotConfiguredError, AnalysisRequest, ClothingAnalyzer
from app.core.config import Settings
from app.core.db import Db
from app.domain.enums import ClothingStatus
from app.models.clothing import Clothing as ClothingModel
from app.repositories import clothing_analysis as analysis_repo
from app.repositories import photo as photo_repo

logger = logging.getLogger(__name__)


def run_clothing_analysis(
    db: Db,
    settings: Settings,
    analyzer: ClothingAnalyzer,
    clothing_id: str,
    content_version: int,
) -> None:
    """Analyze one garment version; save ``done`` only if still current."""
    with db.read() as s:
        clothing = s.get(ClothingModel, clothing_id)
        if clothing is None:
            return
        if clothing.status == ClothingStatus.WITHDRAWN:
            return
        if clothing.content_version != content_version:
            return
        category = clothing.category
        title = clothing.title
        description = clothing.description
        measurements = {
            "total_length": clothing.measure_total_length,
            "chest": clothing.measure_chest,
            "shoulder": clothing.measure_shoulder,
            "sleeve": clothing.measure_sleeve,
            "waist": clothing.measure_waist,
            "hem": clothing.measure_hem,
            "inseam": clothing.measure_inseam,
            "thigh": clothing.measure_thigh,
        }
        photos = photo_repo.photos_for(s, [clothing_id]).get(clothing_id, [])[:3]
        metas = [(photo.storage_location, photo.content_type) for photo in photos]
        photo_dir = settings.photo_dir
    try:
        images = [
            f"data:{content_type};base64,"
            f"{base64.b64encode(Path(photo_dir, location).read_bytes()).decode('ascii')}"
            for location, content_type in metas
        ]
    except OSError as exc:
        _mark_failed(db, clothing_id, content_version, reason=type(exc).__name__, latency_ms=0)
        return
    request = AnalysisRequest(
        images=images,
        category=category,
        title=title,
        description=description,
        measurements=measurements,
    )
    start = time.perf_counter()
    try:
        result = analyzer.analyze(request)
    except AINotConfiguredError:
        return
    except Exception as exc:  # noqa: BLE001 - background job must converge to failed, never crash
        _mark_failed(
            db,
            clothing_id,
            content_version,
            reason=type(exc).__name__,
            latency_ms=int((time.perf_counter() - start) * 1000),
        )
        return
    latency_ms = int((time.perf_counter() - start) * 1000)
    now = datetime.now(UTC)
    with db.write() as s:
        clothing = s.get(ClothingModel, clothing_id)
        if (
            clothing is None
            or clothing.status == ClothingStatus.WITHDRAWN
            or clothing.content_version != content_version
        ):
            return
        analysis_repo.conditional_save(
            s,
            clothing_id,
            content_version,
            features=result.model_dump(mode="json", exclude={"uncertainties"}),
            uncertainties=[item.model_dump(mode="json") for item in result.uncertainties],
            model_info={"model_id": settings.ai_model_id, "latency_ms": latency_ms},
            now=now,
        )


def _mark_failed(
    db: Db, clothing_id: str, content_version: int, *, reason: str, latency_ms: int
) -> None:
    with db.write() as s:
        rowcount = analysis_repo.mark_failed(s, clothing_id, content_version, datetime.now(UTC))
    if rowcount == 0:
        logger.info(
            "ai_call_discarded",
            extra={
                "task": "clothing_analysis",
                "reason": "discarded_stale_version",
                "latency_ms": latency_ms,
            },
        )
        return
    logger.warning(
        "ai_call_failed",
        extra={"task": "clothing_analysis", "reason": reason, "latency_ms": latency_ms},
    )


def mark_pending_failed(db: Db) -> int:
    """Mark every leftover pending row failed (startup cleanup)."""
    # Fresh database before migrations has no table; nothing to clean.
    if not sqlalchemy_inspect(db.write_engine).has_table("clothing_analyses"):
        return 0
    with db.write() as s:
        return analysis_repo.mark_failed_all(s, datetime.now(UTC))
