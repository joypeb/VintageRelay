"""FastAPI Depends provider for the clothing analyzer (018).

Production builds the real client from settings; tests override with the
fake via dependency_overrides.
"""

from app.ai.client import SHARED_SLOTS, HttpxChatCompletionsClient
from app.ai.protocols import AIUnavailableError, ClothingAnalyzer
from app.core.config import get_settings


def get_analyzer() -> ClothingAnalyzer:
    settings = get_settings()
    api_key = settings.ai_api_key.get_secret_value() if settings.ai_api_key else None
    if not api_key:
        raise AIUnavailableError("AI_API_KEY is not configured.")
    return HttpxChatCompletionsClient(
        api_key=api_key,
        base_url=settings.ai_api_base_url,
        model_id=settings.ai_model_id,
        timeout_seconds=settings.ai_analysis_timeout_seconds,
        slot_wait_seconds=settings.ai_slot_wait_seconds,
        slots=SHARED_SLOTS,
    )
