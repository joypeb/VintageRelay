# 로깅

외부 로깅 라이브러리 없이 표준 `logging`만 사용한다. 설정은 `app/core/logging.py` 한 곳에서 한다.

## 설정

- 모듈마다 `logger = logging.getLogger(__name__)`. 루트 로거 직접 사용(`logging.info(...)`) **금지**.
- 출력은 stdout 한 곳. 형식은 환경 변수 `LOG_FORMAT`으로 고른다: 개발 `text`, 배포 `json`.
- 레벨은 `LOG_LEVEL`(기본 `INFO`). `uvicorn.access` 로그는 끄고 아래 미들웨어의 요청 로그로 대체한다(중복 방지).
- `logging.basicConfig`를 여러 곳에서 호출하는 것 **금지**. 앱 시작 시 `setup_logging()` 1회.

## 구조화 로그

메시지는 **고정된 이벤트 이름**, 가변 값은 `extra`로 넘긴다. f-string으로 값을 메시지에 섞는 것은 **금지**(검색·집계가 어려움).

```python
logger.info("trade_confirmed", extra={"proposal_id": p.id, "event_id": p.event_id, "size": 3})
```

JSON 포매터는 짧게 직접 구현한다.

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

## 요청 ID 미들웨어

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

- 모든 응답에 `X-Request-ID` 헤더를 **반드시** 붙인다. 500 에러 신고 시 이 값으로 로그를 찾는다.
- 동기 라우트는 스레드풀에서 실행되지만 FastAPI가 contextvar를 복사하므로 라우트·서비스 로그에도 요청 ID가 찍힌다.

## 레벨 기준

| 레벨 | 언제 | 예 |
|---|---|---|
| `DEBUG` | 개발 중 상세 추적. 배포에서 끔 | 순환 탐색 후보 수, SQL(`echo`) |
| `INFO` | 의미 있는 상태 변화 | 행사 생성·종료, 교환안 생성·확정·취소, 요청 로그 |
| `WARNING` | 예상된 실패, 대체 흐름 진입 | AI 타임아웃 → 수동 선택, 버전 불일치 409, `database is locked` 재시도 |
| `ERROR` | 처리 못한 실패 | 전역 핸들러의 500 (`logger.exception`) |

- 4xx 도메인 예외는 `ERROR`로 남기지 않는다(정상 흐름). 필요하면 `INFO`/`WARNING`.
- 교환 확정·취소·행사 종료는 감사 목적으로 `INFO`를 **반드시** 남긴다(누가, 어떤 교환안·버전).

## 민감정보 마스킹

다음은 로그에 원문으로 남기는 것을 **금지**한다.

- 세션 토큰·쿠키, `Authorization` 헤더, Meta API 키
- 입장코드(`entry_code`) — 행사 입장 수단이므로 앞 2자리 외 마스킹
- 사진 바이너리·base64, AI 요청 프롬프트 전문과 응답 전문
- 참가자 자유 텍스트(취향 원문, 의류 설명) — 길이만 기록

```python
SENSITIVE_KEYS = {"authorization", "cookie", "token", "session", "api_key", "entry_code", "image"}

def mask(data: dict[str, object]) -> dict[str, object]:
    return {k: ("***" if any(s in k.lower() for s in SENSITIVE_KEYS) else v) for k, v in data.items()}
```

- 요청 본문 전체를 로그로 찍는 것 **금지**. 필요한 ID만 `extra`로 남긴다.
- 로그에서 참가자는 `participant_id`로 식별하고 `display_name`은 남기지 않는다(권장).
