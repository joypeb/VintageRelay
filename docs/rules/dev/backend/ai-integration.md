# AI Integration

Call Meta Model API from the server (`muse-spark-1.3` is the first candidate). Model access and structured output support remain unverified. Follow "AI and System Responsibilities" in [AGENTS.md](../../../../AGENTS.md).

## Isolation

- Put external calls only in `app/ai/client.py`. **No** AI calls from routers, repositories, or `domain`. Only services use the AI client.
- Define a protocol/interface and inject it as a dependency. Provide a fake for tests and demo emergencies.
- Read keys only from environment variables (`pydantic-settings`, `SecretStr`). **Never** expose them in code, logs, responses, or frontend.
- **Do not** keep DB transactions open during AI calls: close read transaction → call AI → save in a new transaction (→ [database.md](database.md#transactions)).

## Timeouts and Retries

- **MUST:** explicitly set timeouts, e.g. `httpx.Client(timeout=httpx.Timeout(20.0, connect=5.0))`. Make values configurable.
- Retry **at most once**, after a short wait (1 second), only for connection failures, 429, 5xx, or invalid model output (analysis structured-output validation only). Do not retry request errors (4xx).
- Convert final failure to `AIUnavailableError` (503) and log `WARNING`. Search falls back to manual filters; a background analysis is marked `failed` instead of raising to a client.
- **MUST:** cap concurrent AI calls with one process-wide `threading.BoundedSemaphore` (fixed cap 4; only the slot wait is configurable). Synchronous AI calls occupy FastAPI's thread pool (default 40); without a cap, bursts exhaust threads and **all requests, including polling/consent, stall**.
- Wait briefly for the semaphore (default 2 seconds); on failure, immediately return `AIUnavailableError` (503) and offer manual filters. **No** long queues. Background analysis jobs use the same cap and mark the analysis `failed` when no slot frees up.

```python
# One process-wide semaphore shared by all analyzer clients (fixed cap).
_ai_slots = threading.BoundedSemaphore(4)

def call_model(self, req: AiRequest) -> AiResponse:
    if not _ai_slots.acquire(timeout=settings.ai_slot_wait_seconds):
        raise AIUnavailableError("AI is busy. Please try again shortly.")
    try:
        return self._post_with_retry(req)
    finally:
        _ai_slots.release()
```

- Validate responses with Pydantic (`ai/schemas.py`). Parsing failures are AI failures. **Do not** pass unvalidated dicts to services.

## Responsibility for AI Output

- **Do not** create/change `exchange_intents`, request acceptance/decline, or proposal consent from AI output. Only explicit participant API requests change these.
- Save AI analysis only in estimated-value columns (`clothing_analyses.features`, `uncertainties`); never overwrite owner-entered fields (category, title, description, measurements).
- **MUST:** validate search interpretation against closed vocabularies (category, colors, measurement names) and drop anything else. AI never returns or ranks garment IDs; ranking is regular code.
- **MUST:** store results with the request-time `content_version` and compare to the current version inside the save transaction. If the garment changed during the AI call, save as `stale` or discard; never mark as current.

```python
# Before AI call (read transaction): v = clothing.content_version
# After AI call (write transaction):
current = db.scalar(select(Clothing.content_version).where(Clothing.id == clothing_id))
status = AnalysisStatus.DONE if current == v else AnalysisStatus.STALE
```

- For concurrent analyses of the same version, **the first saved `done` result wins**; later results are discarded ([AI features](../../../plans/ai-features-v1.md)). Enforce this in the write transaction (check for an existing `done` row for `(clothing_id, content_version)`).
- Include in prompts: "Mark defects, fit, authenticity, and prices not verifiable from photos as requiring confirmation." Never store "unverified" as "absent".
- `domain/matching.py`, not AI, handles cycle detection (alternative garment detection is deferred).
