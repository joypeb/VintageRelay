# Project Structure

## Directories

```text
backend/
├── pyproject.toml          # Dependencies and ruff/mypy/pytest configuration
├── uv.lock                 # Must be committed
├── alembic.ini
├── alembic/versions/       # Migrations
├── app/
│   ├── main.py             # Create FastAPI app; register routers, middleware, handlers
│   ├── core/
│   │   ├── config.py       # pydantic-settings configuration
│   │   ├── db.py           # engine, SessionLocal, SQLite pragma
│   │   └── logging.py      # Logging and request ID middleware
│   ├── api/
│   │   ├── deps.py         # get_db, get_current_participant, require_organizer
│   │   ├── errors.py       # Global exception handlers
│   │   └── routers/        # events.py, clothes.py, intents.py, trades.py ...
│   ├── schemas/            # Pydantic requests/responses (one file per resource)
│   ├── services/           # Use cases, transaction boundaries, authorization/state checks
│   ├── repositories/       # SQLAlchemy queries
│   ├── models/             # SQLAlchemy ORM models (one file per table)
│   ├── domain/
│   │   ├── errors.py       # Domain exception hierarchy
│   │   ├── enums.py        # Status values (EventStatus, ClothingStatus, etc.)
│   │   └── matching.py     # Two-/three-person cycles and alternatives (pure functions)
│   └── ai/
│       ├── client.py       # Meta Model API calls
│       └── schemas.py      # AI structured output models
└── tests/
```

Match resource filenames to DB tables, e.g. `models/clothing.py`, `schemas/clothing.py`, `services/clothing.py`, `repositories/clothing.py`.

## Layer Responsibilities

| Layer | Does | Does not |
|---|---|---|
| `api/routers` | Paths, request parsing, dependency injection, service calls, response models | Business rules, queries, commits |
| `services` | Use cases, event/ownership/version checks, transaction commits, AI calls | HTTP concepts (`Request`, `HTTPException`, status codes) |
| `repositories` | `select`/`insert`/`update`, conditional updates | Commits, business decisions |
| `models` | Tables, columns, constraints | Logic |
| `domain` | Pure rules (cycle detection), exceptions, enums | DB/HTTP/AI access |
| `ai` | External model calls and response parsing | DB access, intent/consent changes |

## Dependency Direction

```text
api → services → repositories → models
          ↓            ↓
        domain  ←──────┘
          ↑
          ai (called only by services)
```

- **MUST:** import only in the direction above. **No** reverse dependencies (e.g. services importing api or repositories importing services).
- `domain` imports no other app packages, only the standard library.
- **No** direct router access to repositories/models. Even simple reads go through services.
- **No** API `schemas` in repositories. Services convert ORM objects to schemas, or routers use `model_validate(obj)`.

## Exchange Logic

- Implement two-/three-person cycles and alternative garment detection as **pure functions** in `domain/matching.py`. Input: intent list (dataclasses/tuples); output: candidate cycles. Unit tests must run without a DB.
- `services/trade.py` owns proposal creation, consent, confirmation, and cancellation transactions.
