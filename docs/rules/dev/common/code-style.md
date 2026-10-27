# Common Code Style

Language-specific formatter/linter details belong in `backend/` and `frontend/`. This document covers shared principles only.

## 1. Language

- **MUST:** write identifiers (variables, functions, classes, files, DB columns, API fields) in English.
- **MUST:** write project documents, code comments/docstrings, review results, PR titles/descriptions/comments, and Git commit messages in English. Agent replies to the user must be in Korean.
- **MUST:** use English for application UI, metadata, accessibility labels, user-facing API messages, and AI-generated application copy. Set the application's HTML language to `en`.
- **MUST NOT:** use romanized Korean identifiers (`otJangbu`, `gyohwan`). Use the glossary below.

| Domain term | Identifier |
|---|---|
| Event | `event` |
| Organizer | `organizer` |
| Participant | `participant` |
| Entry code | `entry_code` / `entryCode` |
| Clothing | `clothing` (same singular/plural; `clothing_item` allowed for an individual item) |
| Preference | `preference` |
| Exchange intent | `intent` |
| Exchange proposal | `proposal` |
| Alternative garment suggestion | `alternative_suggestion` |
| Consent | `consent` |
| Confirm / cancel / close | `confirm` / `cancel` / `close` |

Add new domain terms to this table before using them.

## 2. Naming

- **MUST:** follow language conventions (Python: `snake_case` functions/variables, `PascalCase` classes; TypeScript: `camelCase` variables/functions, `PascalCase` types/components).
- **MUST:** use `UPPER_SNAKE_CASE` for constants.
- **MUST:** prefix booleans with `is_`/`has_`/`can_` (TS: `is`/`has`/`can`), e.g. `is_confirmed`, `canCancel`.
- **MUST:** start function names with verbs, e.g. `create_event`, `findCycles`.
- **MUST NOT:** use meaningless names (`data2`, `tmp`, `foo`, `handleClick2`). Loop indices `i`, `j` are allowed.
- **MUST NOT:** use unapproved abbreviations. Allowed: `id`, `url`, `api`, `ai`, `db`, `qr`.

## 3. Magic Numbers and Strings

- **MUST NOT:** embed meaningful numbers/strings directly in code. Extract named constants or enums.
- Allowed: obvious values such as `0`, `1`, `-1`, and empty strings.

```python
MAX_CYCLE_SIZE = 3          # Support cycles of up to three participants
if len(cycle) > MAX_CYCLE_SIZE: ...
```

```ts
const PROPOSAL_STATUS = { PENDING: "pending", CONFIRMED: "confirmed" } as const;
```

- **MUST:** define status values (`active`, `closed`, `confirmed`, etc.) once and reuse them. API status values follow [api-contract.md](api-contract.md).

## 4. Function and File Size

- **SHOULD:** keep each function focused on one task and within 50 lines.
- **SHOULD:** keep files within 300 lines; split by responsibility when larger.
- **SHOULD:** limit nesting to three levels and use early returns.
- **MUST NOT:** copy the same logic three or more times. Extract a function on the third occurrence (two copies are allowed).

## 5. Comments

- **MUST:** explain why, rather than what is already evident from code.
- **MUST:** briefly cite the relevant rule where implementing domain logic, e.g. `# A garment can be confirmed in only one exchange (AGENTS.md: Core Exchange Rules)`.
- **MUST:** mark temporary behavior/open decisions as `TODO(name): description`.
- **MUST NOT:** commit commented-out dead code. Use Git history if needed.

## 6. Other Rules

- **MUST:** apply the formatter before committing (see area-specific tools).
- **MUST:** use UTF-8, LF, and exactly one trailing newline.
- **MUST NOT:** leave unused imports, variables, or functions.
- **SHOULD:** validate external input (requests, AI output, environment variables) once at the boundary and trust validated internal types.
