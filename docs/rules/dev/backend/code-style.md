# 코드 스타일

## 기본

- PEP 8을 따르고, 포맷은 `ruff format`에 맡긴다. 수동 정렬 논쟁 **금지**.
- 이름: 모듈·함수·변수 `snake_case`, 클래스 `PascalCase`, 상수 `UPPER_SNAKE_CASE`.
- 상태 값은 문자열 리터럴 대신 `domain/enums.py`의 `StrEnum`을 **반드시** 사용한다.
- 주석과 docstring은 한국어로 짧게. "무엇"보다 "왜"를 적는다.
- `print()` **금지**. [logging.md](logging.md)의 로거를 사용한다.
- 와일드카드 import(`from x import *`), 가변 기본 인자(`def f(x=[])`) **금지**.

## 타입 힌트

- 모든 함수의 인자와 반환값에 타입 힌트를 **반드시** 단다(테스트 함수 제외).
- 최신 문법 사용: `list[int]`, `X | None`, `type Alias = ...`. `typing.List`, `Optional` **금지**.
- `Any`는 외부 API 원시 응답 파싱 직전에만 허용한다.
- `mypy --strict` 기준으로 통과해야 한다. `# type: ignore`는 오류 코드와 이유를 함께 쓴다(`# type: ignore[attr-defined]  # 이유`).

## ruff · mypy 설정 (`pyproject.toml`)

```toml
[tool.ruff]
line-length = 100
target-version = "py314"

[tool.ruff.lint]
select = ["E", "F", "W", "I", "B", "UP", "N", "SIM", "RUF", "ASYNC", "S", "BLE", "T20", "FAST"]

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S"]  # 테스트의 assert 등 허용

[tool.mypy]
python_version = "3.14"
strict = true
plugins = ["pydantic.mypy"]
```

- `BLE`(bare/broad except), `T20`(print), `FAST`(FastAPI 규칙)은 끄지 않는다.

## async 사용 기준

SQLite + 동기 SQLAlchemy를 기본으로 한다. 섞어 쓰다 이벤트 루프를 막는 사고를 피하기 위한 규칙이다.

- DB를 쓰는 라우트는 **`def`(동기)** 로 작성한다. FastAPI가 스레드풀에서 실행한다.
- `async def` 라우트 안에서 동기 DB 호출·`time.sleep`·동기 HTTP 호출은 **금지**(루프 블로킹).
- AI 호출은 서비스 계층에서 동기 `httpx.Client`로 수행한다(→ [ai-integration.md](ai-integration.md)). 동기 라우트에서 호출되므로 스레드풀에서 돈다.
- `async def`는 DB·외부 I/O가 없는 라우트(헬스체크 등)와 미들웨어에만 권장.
- 비동기 SQLAlchemy(`aiosqlite`)는 도입하지 않는다. SQLite는 쓰기가 직렬화되므로 이점이 거의 없다.

## Pydantic v2 스키마

- v2 API만 사용: `model_config = ConfigDict(...)`, `model_validate`, `model_dump`, `field_validator`, `model_validator`. v1 문법(`class Config`, `.dict()`, `parse_obj`, `@validator`) **금지**.
- 요청·응답 모델을 분리한다: `ClothingCreate`, `ClothingUpdate`, `ClothingRead`. ORM 모델을 그대로 응답하는 것은 **금지**.
- 모든 API 스키마는 공통 베이스를 상속한다.

```python
from pydantic import BaseModel, ConfigDict

class ApiModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",          # 요청에 모르는 필드가 오면 422
        from_attributes=True,    # ORM 객체 → 응답 변환
        str_strip_whitespace=True,
    )
```

- JSON 필드 케이스와 날짜 형식은 [../common/api-contract.md](../common/api-contract.md)를 따른다. API JSON은 camelCase로 확정됐다. 모든 요청·응답 스키마는 `alias_generator=to_camel`, `populate_by_name=True`를 가진 공통 베이스 모델을 **반드시** 상속하고, 응답은 alias(camelCase)로 직렬화한다. 개별 필드에 alias를 손으로 다는 것은 **금지**.
- 입력 제약은 `Field`로 선언한다(`Field(min_length=1, max_length=500)`). 길이 상한은 모든 자유 텍스트 필드에 **반드시** 둔다.
- ID·버전 등 서버가 정하는 값은 요청 스키마에 넣지 않는다. 단, 교환안 동의 요청에는 클라이언트가 본 `version`을 **반드시** 포함한다.
- 비즈니스 규칙(행사 상태, 소유권 등) 검증을 validator에 넣는 것은 **금지**. 스키마는 형태만 검증하고 규칙은 서비스에서 검사한다.
