# Testing

Use pytest only. With limited hackathon time, **write exchange rule and integrity tests first**; cover simple CRUD with a few API tests.

## Structure

```text
tests/
├── conftest.py           # engine, db, client, factories, AI fake
├── unit/
│   └── test_matching.py  # Pure domain/matching.py functions (no DB)
├── services/             # Services with real SQLite
│   ├── test_trade_confirm.py
│   └── test_trade_cancel.py
└── api/                  # HTTP contracts, authorization, errors via TestClient
    └── test_events.py
```

- Files: `test_<target>.py`; functions: `test_<condition>_<expected_result>`, e.g. `test_confirm_when_clothing_already_confirmed_raises_conflict`.
- Write test names and docstrings in English.
- Test one rule at a time; separate Given/When/Then with blank lines (recommended).

## Test Database

- Create a **real SQLite file** in `tmp_path`. Reuse production `core/db.py` settings (pragmas and separate read `BEGIN`/write `BEGIN IMMEDIATE` engines). `make_engine` below represents an engine factory with these settings.
- **No** `:memory:` DBs in service/API tests: separate connections have separate databases, preventing concurrency tests.
- Create schemas with `Base.metadata.create_all()`. Recommend one separate migration test verifying `alembic upgrade head` on an empty DB.
- **No** shared test state. Create a fresh DB for every test (file creation is cheap).
- **MUST:** replace external AI with a fake (`app.dependency_overrides`). **No** real Meta API calls in tests.

```python
@pytest.fixture
def engine(tmp_path: Path) -> Iterator[Engine]:
    eng = make_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()

@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: _session(engine)
    app.dependency_overrides[get_ai_client] = lambda: FakeAIClient()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

- Create events/participants/clothing/intents through factories in `conftest.py`. **No** repeated manual INSERTs per test.

## Priority Tests

**Write these alongside implementation**, in descending priority.

### 1. Cycle Detection (Unit)

- Two people: A offers pants for a jacket, B offers the jacket for pants → one two-person proposal.
- Three people: A→B→C→A intents → one three-person proposal, each gives/receives one garment.
- C does not want A's garment → no proposal.
- Only a four-person cycle exists → no proposal (out of scope).
- The same participant can appear in two proposals using different garments.
- No cycles between one's own garments or across events.
- Alternative garment: detect when another owned garment completes a three-person cycle without changing intents.

### 2. Confirmation and Duplicate Prevention (Services)

- Confirm only with unanimous consent; partial consent stays pending.
- Old-version consent → `StaleProposalError`, no consent recorded.
- Confirm one of two proposals sharing clothing → invalidate the other.
- Confirm with an already confirmed garment → `ClothingUnavailableError`, **nothing changes** (verify rollback).
- **Concurrent confirmation:** send final consent for two overlapping proposals on two threads → exactly one confirms.
- **Invariant:** after confirmation/cancellation, `is_confirmed = 1` ⇔ proposal confirmed ⇔ offered garment confirmed. Partial index violations become `ClothingUnavailableError`.
- **Duplicate requests:** consent twice to the same version → second also 200, one consent record. Two parties concurrently cancel → both 200, garment state restored once.
- **Proposal deduplication:** register three cycle-forming intents in different orders/concurrently → exactly one pending proposal (same `cycle_key`).
- **Alternative acceptance:** another participant withdraws an intent after suggestion viewing → acceptance returns 409, actor's intent unchanged.
- **AI analysis race:** edit a clothing description during a fake AI call → analysis is not shown as current (`stale`).

```python
def test_concurrent_confirm_only_one_wins(engine: Engine, two_proposals_sharing_clothing) -> None:
    p1, p2 = two_proposals_sharing_clothing
    barrier = threading.Barrier(2)
    def agree(p): barrier.wait(); return try_final_agree(engine, p)
    with ThreadPoolExecutor(2) as ex:
        results = list(ex.map(agree, [p1, p2]))
    assert sorted(results) == ["conflict", "confirmed"]
```

### 3. Cancellation and Closure (Services)

- Cancel confirmed exchange → entire exchange cancelled, related garments available again.
- Consent/confirmation/cancellation/intent changes in a closed event → `EventClosedError`.
- Closure cancels unconfirmed proposals and retains confirmed records for viewing.
- Concurrent closure and final consent → no new confirmation after closure.

### 4. Authorization and Contract (API)

- Edit another's garment, consent as a nonparty, close as non-organizer → 403.
- Entry code alone does not grant organizer permissions.
- Shared error format (`{"error": {"code", "message", "details", "requestId"}}`), matching `requestId` and `X-Request-ID`: one test each for 422/404/409/500.
- Manual clothing list retrieval succeeds even when fake AI raises an exception.
- Exceed AI concurrency cap → wait then 503 `AI_UNAVAILABLE`; other APIs (lists) remain responsive.

## Running Tests

- Pass all of `uv run pytest` before committing. **Do not** hide failures with `skip`; mark unimplemented cases with `xfail(reason=...)`.
- No numeric coverage target. Judge by the priority list above.
