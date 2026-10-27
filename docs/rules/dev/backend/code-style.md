# Code Style

## Basics

- Follow PEP 8 and let `ruff format` handle formatting. **No** manual alignment debates.
- Names: `snake_case` modules/functions/variables, `PascalCase` classes, `UPPER_SNAKE_CASE` constants.
- **MUST:** use `StrEnum` from `domain/enums.py` for statuses, not string literals.
- Write concise English comments and docstrings. Explain why rather than what.
- **No** `print()`. Use the logger in [logging.md](logging.md).
- **No** wildcard imports (`from x import *`) or mutable defaults (`def f(x=[])`).

## Type Hints

- **MUST:** annotate all function parameters and return types (except test functions).
- Use modern syntax: `list[int]`, `X | None`, `type Alias = ...`. **No** `typing.List` or `Optional`.
- Allow `Any` only immediately before parsing raw external API responses.
- Pass `mypy --strict`. Include an error code and reason with `# type: ignore` (`# type: ignore[attr-defined]  # reason`).

## ruff and mypy Configuration (`pyproject.toml`)

```toml
[tool.ruff]
line-length = 100
target-version = "py314"

[tool.ruff.lint]
select = ["E", "F", "W", "I", "B", "UP", "N", "SIM", "RUF", "ASYNC", "S", "BLE", "T20", "FAST"]

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S"]  # Allow test assertions, etc.

[tool.mypy]
python_version = "3.14"
strict = true
plugins = ["pydantic.mypy"]
```

- Do not disable `BLE` (bare/broad except), `T20` (print), or `FAST` (FastAPI rules).

## Async Rules

Use SQLite and synchronous SQLAlchemy by default to avoid accidentally blocking the event loop by mixing styles.

- Write DB routes as **synchronous `def`**; FastAPI runs them in its thread pool.
- **No** synchronous DB calls, `time.sleep`, or synchronous HTTP calls inside `async def` routes (event loop blocking).
- Call AI from services with synchronous `httpx.Client` (→ [ai-integration.md](ai-integration.md)). Synchronous routes run it in the thread pool.
- Recommend `async def` only for middleware and routes without DB/external I/O, such as health checks.
- Do not add asynchronous SQLAlchemy (`aiosqlite`); SQLite serializes writes, so there is little benefit.

## Pydantic v2 Schemas

- Use only v2 APIs: `model_config = ConfigDict(...)`, `model_validate`, `model_dump`, `field_validator`, `model_validator`. **No** v1 syntax (`class Config`, `.dict()`, `parse_obj`, `@validator`).
- Separate request/response models: `ClothingCreate`, `ClothingUpdate`, `ClothingRead`. **Do not** return ORM models directly.
- All API schemas inherit a shared base.

```python
from pydantic import BaseModel, ConfigDict

class ApiModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",          # Unknown request fields produce 422
        from_attributes=True,    # Convert ORM objects to responses
        str_strip_whitespace=True,
    )
```

- Follow [../common/api-contract.md](../common/api-contract.md) for JSON casing and dates. API JSON is camelCase. **All** request/response schemas inherit a shared base with `alias_generator=to_camel`, `populate_by_name=True`; serialize responses by alias. **No** handwritten per-field aliases.
- Declare input constraints with `Field` (`Field(min_length=1, max_length=500)`). **Every** free-text field needs a maximum length.
- Exclude server-assigned values such as IDs/versions from request schemas, except proposal consent requests **must** include the `version` seen by the client.
- **Do not** validate business rules (event status, ownership, etc.) in validators. Schemas validate shape; services check rules.
