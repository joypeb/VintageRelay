# Logging

Use standard `logging` only, without external logging libraries. Configure it centrally in `app/core/logging.py`.

## Configuration

- Use `logger = logging.getLogger(__name__)` per module. **No** direct root logger calls (`logging.info(...)`).
- Output only to stdout. Select format with `LOG_FORMAT`: `text` for development, `json` for deployment.
- Use `LOG_LEVEL` (default `INFO`). Disable `uvicorn.access` and replace it with middleware request logs below to avoid duplication.
- **Do not** call `logging.basicConfig` in multiple places. Call `setup_logging()` once at startup.

## Structured Logs

Use **fixed event names** as messages and pass variables through `extra`. **No** f-string interpolation into messages; it impedes search/aggregation.

```python
logger.info("trade_confirmed", extra={"proposal_id": p.id, "event_id": p.event_id, "size": 3})
```

Implement a short JSON formatter directly.

```python
_RESERVED = set(vars(logging.makeLogRecord({})))

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {
            "ts": self.formatTime(record), "level": record.levelname,
            "logger": record.name, "msg": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        data |= {k: v for k, v in vars(record).items() if k not in _RESERVED}
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return json.dumps(mask(data), ensure_ascii=False, default=str)
```

## Request ID Middleware

```python
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

@app.middleware("http")
async def request_context(request: Request, call_next: RequestResponseEndpoint) -> Response:
    rid = request.headers.get("X-Request-ID") or uuid4().hex
    token = request_id_var.set(rid)
    start = time.perf_counter()
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        logger.info("request", extra={"method": request.method, "path": request.url.path,
                                      "status": response.status_code,
                                      "ms": round((time.perf_counter() - start) * 1000)})
        return response
    finally:
        request_id_var.reset(token)
```

- **MUST:** attach `X-Request-ID` to every response. Use it to find logs for 500 error reports.
- Synchronous routes run in the thread pool, but FastAPI copies contextvars, so route/service logs retain the request ID.

## Levels

| Level | When | Examples |
|---|---|---|
| `DEBUG` | Detailed development tracing; disabled in deployment | Cycle candidate counts, SQL (`echo`) |
| `INFO` | Meaningful state changes | Event creation/closure, proposal creation/confirmation/cancellation, requests |
| `WARNING` | Expected failures and fallbacks | AI timeout → manual selection, version mismatch 409, `database is locked` retry |
| `ERROR` | Unhandled failures | Global 500 handler (`logger.exception`) |

- Do not log 4xx domain exceptions at `ERROR` (normal flow). Use `INFO`/`WARNING` if needed.
- **MUST:** log exchange confirmation/cancellation and event closure at `INFO` for auditing (actor, proposal, version).

## Sensitive Data Masking

**Never** log the following raw:

- Session tokens/cookies, `Authorization` headers, Meta API keys.
- Entry codes (`entry_code`): mask all but the first two characters because they grant event entry.
- Photo bytes/base64, complete AI prompts and responses.
- Participant free text (preferences, clothing descriptions): log lengths only.

```python
SENSITIVE_KEYS = {"authorization", "cookie", "token", "session", "api_key", "entry_code", "image"}

def mask(data: dict[str, object]) -> dict[str, object]:
    return {k: ("***" if any(s in k.lower() for s in SENSITIVE_KEYS) else v) for k, v in data.items()}
```

- **No** full request body logging. Include only needed IDs in `extra`.
- Identify participants by `participant_id`; avoid `display_name` in logs (recommended).
