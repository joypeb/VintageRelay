# Error Handling

[../common/api-contract.md](../common/api-contract.md) defines error JSON and codes. This document describes backend implementation.

```json
{ "error": { "code": "EVENT_CLOSED", "message": "This event is closed.", "details": null, "requestId": "b7e2..." } }
```

## Domain Exception Hierarchy

Define these in `app/domain/errors.py`. Services and domain code raise only these exceptions.

```python
class AppError(Exception):
    status_code: int = 400
    code: str = "BAD_REQUEST"
    message: str = "Invalid request."

    def __init__(self, message: str | None = None, *, details: dict[str, object] | None = None) -> None:
        super().__init__(message or self.message)
        self.message = message or self.message
        self.details = details or {}

class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"
    message = "Resource not found."

class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"

class EventClosedError(ConflictError):
    code = "EVENT_CLOSED"
    message = "This event is closed."
```

| Exception | HTTP | Purpose |
|---|---|---|
| `UnauthenticatedError` | 401 | Missing/expired session |
| `ForbiddenError` | 403 | Permission denied |
| `NotFoundError` | 404 | Missing resource |
| `ConflictError` | 409 | Base class for state conflicts |
| └ `EventClosedError` | 409 | Write to a closed event |
| └ `StaleProposalError` | 409 | Version mismatch (`PROPOSAL_VERSION_MISMATCH`) |
| └ `ProposalInvalidatedError` | 409 | Respond to invalidated proposal (`PROPOSAL_VERSION_MISMATCH`) |
| └ `ClothingUnavailableError` | 409 | Already confirmed garment (`CLOTHING_ALREADY_CONFIRMED`) |
| `AIUnavailableError` | 503 | AI timeout/failure (`AI_UNAVAILABLE`) |

- Concrete codes **must** match the shared list. Add missing codes to the common document first.
- `message` is a user-safe English sentence. **No** internal IDs, SQL, or stack information.
- `details` contains only frontend branching values, e.g. `{"currentVersion": 3}`. Use camelCase keys as in response JSON.

## Global Exception Handlers

Define in `app/api/errors.py`, register in `main.py`. All error responses pass through these handlers into the common format.

```python
def _body(request: Request, code: str, message: str, details: object = None) -> dict[str, object]:
    # requestId is request_id_var from request ID middleware (logging.md), matching X-Request-ID
    return {"error": {"code": code, "message": message, "details": details or None,
                      "requestId": request_id_var.get()}}

_HTTP_CODES = {400: "BAD_REQUEST", 401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND"}

def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(_body(request, exc.code, exc.message, exc.details), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [{"field": to_camel(str(e["loc"][-1])), "reason": e["type"]} for e in exc.errors()]
        return JSONResponse(_body(request, "VALIDATION_ERROR", "Please check your input.", {"fields": fields}), 422)

    @app.exception_handler(StarletteHTTPException)   # Missing routes (404), 405, etc.
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "BAD_REQUEST")
        return JSONResponse(_body(request, code, "Unable to process this request."), exc.status_code)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_error", extra={"path": request.url.path})
        return JSONResponse(_body(request, "INTERNAL_ERROR", "A temporary error occurred."), 500)
```

- Use only common contract codes. **No** arbitrary codes such as `HTTP_405`.
- Validation `details` follows `{"fields": [{"field", "reason"}]}` with camelCase `field` (`pydantic.alias_generators.to_camel`).

- Omit `RequestValidationError.input` from responses to prevent sensitive data exposure.
- `Exception` handlers run in the outermost `ServerErrorMiddleware`, possibly after request ID middleware's `finally`. **MUST:** test that 500 responses retain `requestId`/`X-Request-ID`; otherwise catch exceptions inside request ID middleware and construct the 500 response there.
- **No** exception messages/stacks in 500 bodies. Log them only, correlated by request ID.

## Mapping

| Condition | Exception | HTTP |
|---|---|---|
| Invalid schema shape | FastAPI automatic validation | 422 |
| Missing/expired session | `UnauthenticatedError` | 401 |
| Edit another's garment, non-organizer, nonparty | `ForbiddenError` | 403 |
| Missing resource or resource in another event | `NotFoundError` | 404 |
| Write to closed event | `EventClosedError` | 409 |
| Consent version differs from current | `StaleProposalError` | 409 |
| Garment already confirmed elsewhere | `ClothingUnavailableError` | 409 |
| AI timeout/failure | `AIUnavailableError` | 503 |

- Recommend 404 for another event's resource ID to avoid revealing existence.
- Catch `sqlalchemy.exc.IntegrityError` in services and convert to meaningful domain exceptions, usually `ConflictError` subclasses. Do not leak it as 500.

## Prohibitions

- **No** bare `except:` or unjustified `except Exception:`. Catch specific exceptions, or log and re-raise.
- **Do not** swallow exceptions with `pass` and return defaults. **Documented fallbacks**, such as manual selection after AI failure, are allowed with `WARNING` logs.
- **No** `HTTPException` in services/domain or direct raises in routers.
- **No** errors wrapped in successful 200 `{"success": false}` responses.
- **MUST:** preserve causes with `raise NewError(...) from exc`.
