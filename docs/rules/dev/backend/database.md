# Database Rules

Follow [database-design-v1.md](../../../plans/database-design-v1.md) for tables. This document defines SQLite/SQLAlchemy/Alembic usage and integrity guarantees.

## SQLite Connection Settings

**Apply** these settings in `core/db.py`.

Use separate engines because read-only and write transactions start differently.

```python
def _make_engine(begin_sql: str) -> Engine:
    engine = create_engine(
        settings.database_url,  # e.g. sqlite:///./data/app.db
        connect_args={"check_same_thread": False, "timeout": 5},
    )

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn, _record) -> None:
        dbapi_conn.isolation_level = None          # Disable pysqlite automatic BEGIN
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys = ON")     # SQLite defaults to OFF
        cur.execute("PRAGMA journal_mode = WAL")    # Concurrent reads and writes
        cur.execute("PRAGMA busy_timeout = 5000")   # Wait up to five seconds for locks
        cur.execute("PRAGMA synchronous = NORMAL")
        cur.close()

    @event.listens_for(engine, "begin")
    def _on_begin(conn) -> None:
        conn.exec_driver_sql(begin_sql)

    return engine

ReadSession = sessionmaker(_make_engine("BEGIN"), expire_on_commit=False, autobegin=False)
WriteSession = sessionmaker(_make_engine("BEGIN IMMEDIATE"), expire_on_commit=False, autobegin=False)

class Db:
    """One per request. Services open transactions with read()/write()."""
    @contextmanager
    def read(self) -> Iterator[Session]:
        with ReadSession() as s, s.begin():
            yield s

    @contextmanager
    def write(self) -> Iterator[Session]:
        with WriteSession() as s, s.begin():
            yield s
```

- `autobegin=False` makes DB access **fail without an explicit transaction**, preventing unintentionally open transactions from holding locks.
- **MUST:** open any transaction that might write with `db.write()` (`BEGIN IMMEDIATE`). Acquiring the write lock at the start **serializes concurrent writes**, preventing requests from intervening between reading/checking and writing. In a simulation, ordinary `BEGIN` caused 87% of concurrent writes to fail with `database is locked`.
- **MUST:** use `db.read()` for read-only transactions (lists, details, polling, `get_current_participant`). WAL reads do not wait for writes. In a simulation (40 reader/2 writer threads), using `BEGIN IMMEDIATE` for reads yielded p95 566ms/p99 1.5s; separate read-only transactions reduced p95 to 6ms.
- **No** writes inside `db.read()`, or writes in another transaction based on checks performed in a read transaction. Checks and writes belong in the same `db.write()`.
- Store DB files under `data/` and exclude them from Git (`.gitignore`).

## Concurrency Limits

- SQLite allows **one concurrent writer**. Writes are serialized; this is sufficient for events with dozens of people.
- Run **one** Uvicorn worker. **No** multiple server instances sharing one DB file, including network filesystems.
- **MUST:** deploy on an **always-on single server with persistent disk**. **No** serverless per-request instances, autoscaling, or disks reset on redeployment. Breaking these conditions invalidates all concurrency guarantees here.
- **No** slow I/O (AI calls, file uploads) inside transactions: long-held locks cause other requests to fail with `database is locked`. Finish slow work outside transactions, then save results in short transactions.
- Consider PostgreSQL at larger scale. To ease migration, keep SQLite-specific SQL in `core/db.py` and migrations (recommended).

## Transactions

- Perform all DB access, including reads, inside `with db.read() as s:` or `with db.write() as s:`. Normal exit commits; exceptions roll back.
- Default boundary: **one service method = one transaction**. AI services split into read transaction → AI call outside transactions → write transaction.
- `deps.get_current_participant` finishes its query in its own `with db.read():` block. Reread authorization-relevant values (event state, ownership) in the service transaction.
- **No** repository `begin()`/`commit()` calls; use `flush()` if needed.
- Checks (event state, ownership, version, garment state) and dependent mutations **must share one transaction**.

```python
def confirm_if_all_agreed(self, actor: Participant, proposal_id: int, version: int) -> TradeProposal:
    with self.db.write() as s:
        proposal = self.trades.get_for_participant(s, proposal_id, actor)  # 404 if not a party; serialized by BEGIN IMMEDIATE
        if self.trades.has_agreed(s, proposal, actor, version):
            return proposal                                   # Replay before event state: return current state unchanged
        self.events.get_active(s, actor.event_id)             # EventClosedError if closed
        ensure_version(proposal, version)                     # StaleProposalError on mismatch
        self.trades.record_agreement(s, proposal, actor)
        if self.trades.all_agreed(s, proposal):
            self._confirm(s, proposal)                        # See duplicate confirmation prevention below
        return proposal
```

## Integrity Through DB Constraints and Transactions

Do not rely solely on application checks. The DB is the last line of defense.

- **MUST:** declare foreign keys, `NOT NULL`, `CHECK` (status values, `offered_clothing_id != received_clothing_id`, etc.), and `UNIQUE` (`trade_participants(proposal_id, participant_id)`) in models.
- Restrict status columns using `CHECK (status IN (...))`, matching `domain/enums.py`.

### Preventing Duplicate Garment Confirmation

Apply **both** safeguards on confirmation.

1. **Conditional update and affected-row check (required):** change only available garments to confirmed. If affected rows differ from the proposal's garment count, raise and roll back to the savepoint taken before the consent write, then invalidate the proposal in the same transaction (see below).

```python
result = db.execute(
    update(Clothing)
    .where(Clothing.id.in_(clothing_ids), Clothing.status == ClothingStatus.AVAILABLE)
    .values(status=ClothingStatus.CONFIRMED)
)
if result.rowcount != len(clothing_ids):
    raise ClothingUnavailableError(...)   # Caught by the confirmation service; see below
```

**Recheck failure handling ([12](../../../plans/api/12-consent-reject-proposal.md)):** the confirmation service catches the recheck error, rolls back to the savepoint (`s.begin_nested()` taken before recording the consent), sets the proposal `status='invalidated'` with the mapped `end_reason` and `ended_at` using `WHERE status='pending'`, commits, and then returns 409 with the recheck code. If the invalidation update (`WHERE status='pending'`) affects zero rows, return the current state's error (`PROPOSAL_VERSION_MISMATCH` or `EVENT_CLOSED`) without changing `end_reason`/`ended_at`.

2. **Partial unique index (required):** index `trade_participants.is_confirmed` so an offered garment belongs to only one confirmed exchange. This column is needed because `trade_proposals` status cannot be referenced by a partial-index predicate ([database-design-v1.md](../../../plans/database-design-v1.md), 3.8).

```python
is_confirmed: Mapped[bool] = mapped_column(default=False, server_default=text("0"))

__table_args__ = (
    Index("uq_confirmed_offered_clothing", "offered_clothing_id",
          unique=True, sqlite_where=text("is_confirmed = 1")),
)
```

- **MUST:** change proposal status, `clothes.status`, and `is_confirmed` together in one transaction on confirmation; revert all three together on cancellation. Centralize this in repository `mark_confirmed()`/`mark_cancelled()`.
- Convert `IntegrityError` for `uq_confirmed_offered_clothing` to `ClothingUnavailableError`.
- **MUST:** test the invariant: rows with `is_confirmed = 1` ⇔ proposal confirmed ⇔ offered garment confirmed.

- **No** unconditional `UNIQUE` on `offered_clothing_id`, because unconfirmed proposals may share garments.
- Invalidate other unconfirmed proposals sharing the garments in the same confirmation transaction.
- Handle closure/confirmation races similarly: reread event state inside confirmation; close with `UPDATE events SET status='closed' WHERE status='active'`. `BEGIN IMMEDIATE` ensures one finishes before the other sees the latest state.

### Proposal Creation and Deduplication

Duplicate pending proposals for the same cycle confuse participants and split their consent, preventing confirmation.

- **MUST:** recalculate proposals in the **same `db.write()` transaction** as the triggering change: intent registration/withdrawal/change, clothing edit/withdrawal, alternative acceptance, or confirmed exchange cancellation. **Do not** defer to a background task or later request (serialization would break).
- **MUST:** store `trade_proposals.cycle_key` as concatenated `participant:offered:received` entries sorted by `participant_id`. The same three-person cycle yields the same key regardless of the starting participant.
- **MUST:** enforce one pending proposal per cycle with a partial unique index. Skip creation if a pending proposal with the same `cycle_key` exists. The index is the last safeguard.

```python
Index("uq_pending_cycle", "event_id", "cycle_key",
      unique=True, sqlite_where=text("status = 'pending'"))
```

- Recalculate only cycles involving changed intents/garments, never the entire event. Consider only available garments and valid intents.

## ORM Rules (SQLAlchemy 2.x)

- Use only 2.0 style: `DeclarativeBase`, `Mapped[...]`, `mapped_column()`, `select()`. **No** `session.query()`.
- Default to lazy relationships; explicitly use `selectinload` when list queries cause N+1 queries.
- Store timestamps in UTC. Serialize per [../common/api-contract.md](../common/api-contract.md).
- Create event → organizer participant → link `organizer_participant_id` in one transaction. Keep that field nullable and fill it immediately after creation in the service.
- **No** raw SQL outside migrations and `core/db.py`. If unavoidable, use `text()` with bound parameters only; **never** format SQL strings.

## Migrations (Alembic)

- **MUST:** change schemas with Alembic revisions. `Base.metadata.create_all()` is allowed only in tests.
- **MUST:** enable `render_as_batch=True` in `alembic/env.py` due to SQLite's `ALTER TABLE` limitations.
- Configure `MetaData(naming_convention=...)` to name constraints/indexes for batch migrations.
- **MUST:** read and correct autogenerated revisions (`alembic revision --autogenerate -m "..."`); partial indexes/CHECK constraints may be omitted.
- **Do not** edit shared revisions. Add a new one. Consolidating revisions early in the hackathon is allowed by team agreement.
