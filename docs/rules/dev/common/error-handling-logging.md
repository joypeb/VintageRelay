# Common Error Handling and Logging

These principles are language-independent; see backend/frontend rules for middleware and logger implementations. [api-contract.md](api-contract.md), section 7, defines API error responses.

## 1. Exception Handling

- **MUST:** explicitly represent expected failures (validation, permissions, closure, version conflicts, duplicate confirmation) as domain errors with agreed error codes.
- **MUST:** catch unexpected exceptions centrally (global handler/error boundary), respond with `INTERNAL_ERROR`, and log stack traces.
- **MUST NOT:** catch exceptions and do nothing (`except: pass`, empty `catch {}`).
- **MUST NOT:** rethrow broadly caught exceptions (`except Exception`, `catch (e)`) with a different meaning and no handling. Preserve the cause when converting (`raise ... from e`, `{ cause: e }`).
- **MUST:** set timeouts for external calls such as model APIs. On failure, guide users to a fallback (manual candidate selection) rather than blocking the flow.
- **MUST:** roll back all changes if a state-changing operation (confirmation, cancellation, closure) fails midway, using DB transactions.
- **SHOULD:** retry only idempotent reads/external calls, at most once or twice.

## 2. User-Facing Errors

- **MUST:** use short English messages that tell users what to do, e.g. “This event is closed, so exchanges are unavailable.”
- **MUST NOT:** show stack traces, SQL, internal paths, or raw external API errors.
- **MUST:** distinguish network failures from server errors in the frontend and offer retry controls when retryable.

## 3. Log Levels

| Level | Meaning | Examples |
|---|---|---|
| `ERROR` | Unhandled failure requiring investigation | Unexpected exception, DB transaction failure |
| `WARNING` | Handled but abnormal condition | Model timeout fallback, concurrent confirmation conflict |
| `INFO` | Major state changes (only a few lines per request) | Event creation/closure, proposal creation/confirmation/cancellation |
| `DEBUG` | Development details; disabled in deployment | Cycle search intermediate results, model request/response summaries |

- **MUST:** log 4xx domain errors (validation, permissions, etc.) at `INFO` or `WARNING`, never `ERROR`.
- **MUST:** configure levels with `LOG_LEVEL`; deployment defaults to `INFO`.
- **MUST NOT:** leave `print` or `console.log` in production code. Use a logger.

## 4. Sensitive Data

**Never record** the following in logs, error responses, or analytics:

- API keys, tokens, session values, cookies, or `Authorization` headers.
- Raw entry codes (mask them if needed, e.g. retain only the first two characters).
- Uploaded photo bytes or base64 images.
- Full participant free text (preferences/descriptions); log lengths or IDs instead.
- Full model API requests/responses (summaries only at `DEBUG`).

- **SHOULD:** log IDs (`eventId`, `participantId`, `proposalId`) rather than personal information.

## 5. Request ID Correlation

- **MUST:** assign a request ID in the backend. Reuse incoming `X-Request-ID`, or generate one if absent.
- **MUST:** include the same ID in all request logs, the response header `X-Request-ID`, and the error body's `requestId`.
- **SHOULD:** show `requestId` in frontend error logs and, if useful, subtly at the bottom of the screen to help locate backend logs in bug reports.
- **SHOULD:** format text logs as `timestamp(UTC) level requestId message key=value`.

```text
2026-10-27T05:30:00Z INFO  b7e2c1 proposal confirmed proposalId=3f1c eventId=9a0d
```
