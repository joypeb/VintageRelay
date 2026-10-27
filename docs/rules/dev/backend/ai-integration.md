# AI Integration

Call Meta Model API from the server (`muse-spark-1.3` is the first candidate). Model access and structured output support remain unverified. Follow "AI and System Responsibilities" in [AGENTS.md](../../../../AGENTS.md).

## Isolation

- Put external calls only in `app/ai/client.py`. **No** AI calls from routers, repositories, or `domain`. Only services use the AI client.
- Define a protocol/interface and inject it as a dependency. Provide a fake for tests and demo emergencies.
- Read keys only from environment variables (`pydantic-settings`, `SecretStr`). **Never** expose them in code, logs, responses, or frontend.
- **Do not** keep DB transactions open during AI calls: close read transaction → call AI → save in a new transaction (→ [database.md](database.md#transactions)).

## Timeouts and Retries

- **MUST:** explicitly set timeouts, e.g. `httpx.Client(timeout=httpx.Timeout(20.0, connect=5.0))`. Make values configurable.
- Retry **at most once**, after a short wait (1 second), only for connection failures, 429, or 5xx. Do not retry request errors (4xx).
- Convert final failure to `AIUnavailableError` (503) and log `WARNING`. Allow switching to manual selection.
- **MUST:** cap concurrent AI calls (`threading.BoundedSemaphore`, configurable default 4). Synchronous AI calls occupy FastAPI's thread pool (default 40); without a cap, bursts exhaust threads and **all requests, including polling/consent, stall**.
- Wait briefly for the semaphore (default 2 seconds); on failure, immediately return `AIUnavailableError` (503) and offer manual selection. **No** long queues.

```python
_ai_slots = threading.BoundedSemaphore(settings.ai_max_concurrency)

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

- **Do not** create/change `exchange_intents`, proposal consent, or alternative acceptance from AI output. Only explicit participant API requests change these.
- Save AI analysis only in estimated-value columns (`features`, `interpreted_conditions`); never overwrite participant-confirmed values (`confirmed_*`).
- **MUST:** recheck that recommended garments belong to the same event and remain available before responding; exclude invalid ones.
- **MUST:** store results with the request-time `content_version` (`version` for preferences) and compare to the current version inside the save transaction. If photos/descriptions/preferences changed during the AI call, save as `stale` or discard; never mark as current.

```python
# Before AI call (read transaction): v = clothing.content_version
# After AI call (write transaction):
current = db.scalar(select(Clothing.content_version).where(Clothing.id == clothing_id))
status = AnalysisStatus.DONE if current == v else AnalysisStatus.STALE
```

- Never overwrite existing `confirmed_*` values with new analysis. Concurrent analyses for the same version may overwrite earlier analysis results, but must not modify `confirmed_*`.
- Include in prompts: "Mark defects, fit, authenticity, and prices not verifiable from photos as requiring confirmation." Never store "unverified" as "absent".
- `domain/matching.py`, not AI, handles cycle and alternative garment detection.
