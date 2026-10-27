# 에러 처리

에러 응답 JSON 포맷과 에러 코드 목록은 [../common/api-contract.md](../common/api-contract.md)에서 정의한다. 이 문서는 백엔드에서 그 포맷을 만드는 방법을 정한다.

```json
{ "error": { "code": "EVENT_CLOSED", "message": "종료된 행사입니다.", "details": null, "requestId": "b7e2..." } }
```

## 도메인 예외 계층

`app/domain/errors.py`에 둔다. 서비스와 도메인 코드는 이 예외만 던진다.

```python
class AppError(Exception):
    status_code: int = 400
    code: str = "BAD_REQUEST"
    message: str = "잘못된 요청입니다."

    def __init__(self, message: str | None = None, *, details: dict[str, object] | None = None) -> None:
        super().__init__(message or self.message)
        self.message = message or self.message
        self.details = details or {}

class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"
    message = "대상을 찾을 수 없습니다."

class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"

class EventClosedError(ConflictError):
    code = "EVENT_CLOSED"
    message = "종료된 행사입니다."
```

| 예외 | HTTP | 용도 |
|---|---|---|
| `UnauthenticatedError` | 401 | 세션 없음·만료 |
| `ForbiddenError` | 403 | 권한 없음 |
| `NotFoundError` | 404 | 리소스 없음 |
| `ConflictError` | 409 | 상태 충돌 공통 부모 |
| └ `EventClosedError` | 409 | 종료된 행사에 쓰기 |
| └ `StaleProposalError` | 409 | 교환안 버전 불일치 (`PROPOSAL_VERSION_MISMATCH`) |
| └ `ProposalInvalidatedError` | 409 | 무효화된 교환안에 응답 (`PROPOSAL_VERSION_MISMATCH`) |
| └ `ClothingUnavailableError` | 409 | 이미 확정된 옷 (`CLOTHING_ALREADY_CONFIRMED`) |
| `AIUnavailableError` | 503 | AI 타임아웃·실패 (`AI_UNAVAILABLE`) |

- 구체 코드 문자열은 공통 에러 코드 목록과 **반드시** 일치시킨다. 목록에 없는 코드가 필요하면 공통 문서에 먼저 추가한다.
- `message`는 사용자에게 보여도 되는 한국어 문장. 내부 ID·SQL·스택 정보를 넣는 것은 **금지**.
- `details`에는 프론트엔드가 분기에 쓸 값만 넣는다(예: `{"currentVersion": 3}`). 키는 응답 JSON과 같이 camelCase.

## 전역 exception handler

`app/api/errors.py`에서 정의하고 `main.py`에서 등록한다. 모든 에러 응답은 이 핸들러를 거쳐 공통 포맷으로 나간다.

```python
def _body(request: Request, code: str, message: str, details: object = None) -> dict[str, object]:
    # requestId는 요청 ID 미들웨어(logging.md)의 request_id_var 값 = X-Request-ID 헤더
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
        return JSONResponse(_body(request, "VALIDATION_ERROR", "입력값을 확인해 주세요.", {"fields": fields}), 422)

    @app.exception_handler(StarletteHTTPException)   # 404 경로 없음, 405 등
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "BAD_REQUEST")
        return JSONResponse(_body(request, code, "요청을 처리할 수 없습니다."), exc.status_code)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_error", extra={"path": request.url.path})
        return JSONResponse(_body(request, "INTERNAL_ERROR", "일시적인 오류가 발생했습니다."), 500)
```

- 에러 코드는 공통 계약의 코드만 쓴다. `HTTP_405` 같은 임의 코드를 만드는 것은 **금지**.
- 검증 에러 `details`는 공통 계약대로 `{"fields": [{"field", "reason"}]}`이며 `field`는 camelCase(`pydantic.alias_generators.to_camel`).

- `RequestValidationError`의 `input` 값은 응답에 넣지 않는다(민감정보 노출 방지).
- `Exception` 핸들러는 가장 바깥의 `ServerErrorMiddleware`에서 실행되어 요청 ID 미들웨어의 `finally` 이후일 수 있다. 500에도 `requestId`·`X-Request-ID`가 빠지지 않는지 구현 시 **반드시** 테스트로 확인하고, 빠지면 요청 ID 미들웨어 안에서 예외를 잡아 500 응답을 만든다.
- 500 응답에 예외 메시지·스택을 담는 것은 **금지**. 로그에만 남긴다(요청 ID로 추적).

## 매핑 기준

| 상황 | 예외 | HTTP |
|---|---|---|
| 스키마 형식 오류 | (FastAPI 자동) | 422 |
| 세션 없음·만료 | `UnauthenticatedError` | 401 |
| 남의 옷 수정, 주최자 아님, 교환안 비당사자 | `ForbiddenError` | 403 |
| 리소스 없음 또는 다른 행사 소속 | `NotFoundError` | 404 |
| 종료된 행사에 쓰기 | `EventClosedError` | 409 |
| 동의한 교환안 버전이 현재와 다름 | `StaleProposalError` | 409 |
| 확정 시 옷이 이미 다른 교환에 확정됨 | `ClothingUnavailableError` | 409 |
| AI 타임아웃·실패 | `AIUnavailableError` | 503 |

- 다른 행사의 리소스 ID로 접근하면 존재 여부를 드러내지 않도록 404를 쓴다(권장).
- `sqlalchemy.exc.IntegrityError`는 서비스에서 잡아 의미 있는 도메인 예외(주로 `ConflictError` 계열)로 변환한다. 그대로 500으로 흘려보내지 않는다.

## 금지 사항

- `except:`(bare except), 이유 없는 `except Exception:` **금지**. 잡는다면 구체 예외를 잡거나, 로그를 남기고 다시 던진다.
- 예외를 삼키고(`pass`) 기본값을 반환하는 것 **금지**. 단, AI 실패 시 수동 선택으로 전환하는 것처럼 **문서화된 대체 흐름**은 허용하며 `WARNING` 로그를 남긴다.
- 서비스·도메인에서 `HTTPException` 사용 **금지**. 라우터에서도 직접 던지지 않는다.
- 에러를 성공 응답(200)에 `{"success": false}`로 담는 것 **금지**.
- 예외 재발생 시 원인을 잃지 않도록 `raise NewError(...) from exc`를 **반드시** 쓴다.
