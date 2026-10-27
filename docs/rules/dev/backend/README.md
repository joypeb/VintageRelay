# Backend Development Rules

Rules for implementing Vintage Relay's backend (FastAPI + SQLite). This hackathon prototype uses only a **practical minimum**.

> Read this with the [common rules (`../common/`)](../common/). Commits/Git, shared API error formats, JSON casing, and dates are defined there and are not redefined here.

## Terminology

- **MUST:** violations require correction during review.
- **MUST NOT:** prohibited; document the reason in a code comment if an exception is necessary.
- **SHOULD:** follow unless there is a specific reason otherwise.

## Baseline Versions (Checked on PyPI/endoflife.date, 2026-10-27)

| Item | Version | Notes |
|---|---|---|
| Python | 3.14.x | Defer 3.15, released in October 2026, because FastAPI lists support only through 3.14. |
| FastAPI | 0.162.x | `fastapi[standard]` |
| Pydantic | 2.14.x | v2 syntax only |
| pydantic-settings | 2.16.x | Environment configuration |
| SQLAlchemy | 2.1.x | 2.0 style (`select()`, `Mapped[]`) |
| Alembic | 1.20.x | Migrations |
| Uvicorn | 0.54.x | ASGI server |
| httpx | 0.28.x | AI API calls and test client |
| uv | 0.13.x | Packages and virtual environments |
| ruff | 0.17.x | Lint and format |
| mypy | 2.4.x | Type checking |
| pytest | 9.1.x | Tests |

- Set lower bounds (`>=`) in `pyproject.toml` and commit `uv.lock` to pin versions.
- Add dependencies only with `uv add <pkg>` (`uv add --dev` for development). **No** `pip install`.

## Contents

| Document | Contents |
|---|---|
| [project-structure.md](project-structure.md) | Directories, layers, and dependency direction |
| [code-style.md](code-style.md) | Python, type hints, ruff/mypy, async rules, Pydantic schemas |
| [api.md](api.md) | Routers, request/response models, dependency injection, authorization checks |
| [database.md](database.md) | SQLite, transactions, concurrency, ORM/Alembic, duplicate confirmation prevention |
| [error-handling.md](error-handling.md) | Domain exceptions, global handlers, shared error format |
| [logging.md](logging.md) | Logging configuration, request IDs, levels, sensitive data masking |
| [testing.md](testing.md) | pytest layout, test DBs, exchange rule test priorities |
| [ai-integration.md](ai-integration.md) | AI isolation, timeouts/retries, responsibility boundaries |

## Common Commands

```bash
uv sync                                  # Install dependencies
uv run fastapi dev app/main.py           # Development server
uv run alembic upgrade head              # Apply migrations
uv run ruff check --fix . && uv run ruff format .
uv run mypy app
uv run pytest
```

Pass `ruff check`, `ruff format --check`, `mypy`, and `pytest` before PRs or commits.

## Governing Principles

- Follow [AGENTS.md](../../../../AGENTS.md) and [PROJECT.md](../../../../PROJECT.md) for exchange rules (one-for-one, two-/three-person cycles, unanimous consent, same version, no duplicate confirmation).
- Do not harden open decisions (session recovery, handover records, retention, etc.) into settled rules. Isolate temporary implementations and mark them with `# TODO(undecided):`.
