# Vintage Relay Constitution

## Core Principles

### I. Exchange Integrity First
Exchange rules (two-/three-person cycles, consent on the same proposal version, no duplicate
garment confirmation, cancellation, closed-event rejection, permissions) are enforced by
regular code, the server, and the database. AI never changes intents or gives consent.

### II. Test-First (NON-NEGOTIABLE)
Every backend behavior and every non-trivial frontend logic change follows Red → Green → Refactor:
write a failing test, confirm it fails for the expected reason, write the minimum code to pass,
then refactor with all tests green. Bug fixes start with a reproducing test. In `tasks.md`,
test tasks precede the implementation tasks they cover.

### III. Test Scope by Risk
Required backend tests are listed in `docs/rules/dev/common/testing.md` and
`docs/rules/dev/backend/testing.md`. Frontend unit tests target pure logic (state
transformations, validation); screens are verified manually at 360–430px widths.
No numeric coverage target.

### IV. Isolated, Deterministic Tests
Tests run without external services: AI is replaced with fakes, and each backend test uses a
fresh SQLite file in `tmp_path`. Failing tests are never deleted or skipped to pass a check;
unimplemented cases use `xfail(reason=...)`.

### V. Simplicity
This is a hackathon prototype. Build the practical minimum that satisfies the rules; defer
open decisions instead of treating them as settled.

## Development Workflow

- Backend: `uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest`.
- Frontend: `pnpm lint && pnpm typecheck && pnpm test`.
- All checks pass before commits and PRs, followed by the review procedure in `AGENTS.md`.

## Governance

This constitution guides spec-kit planning. `AGENTS.md` and `docs/rules/dev/` remain the
detailed source of rules; on conflict, the latest user decision and `AGENTS.md` win.
Amendments update the version below. Versioning is semantic: MAJOR for removed or redefined principles, MINOR for new principles or material expansion, PATCH for wording clarifications. Every amendment keeps `AGENTS.md` and `docs/rules/dev/` consistent in the same change.

**Version**: 1.0.0 | **Ratified**: 2026-10-28 | **Last Amended**: 2026-10-28
