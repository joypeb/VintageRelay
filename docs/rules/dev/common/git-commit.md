# Commit Message Rules

Follow [Conventional Commits](https://www.conventionalcommits.org/).

## 1. Format

```text
type(scope): subject

Optional body

Optional footer
```

- **MUST:** use lowercase English `type` and `scope` from the lists below.
- **MUST:** put one space after the colon. (The first commit, `docs(docs):first commit`, is a historical exception; use `docs(docs): first commit` going forward.)
- **MUST:** write the subject, body, and footer in English. Describe the change in a subject of at most 50 characters with no final period.
- **SHOULD:** start the subject with an imperative verb, such as "add" or "fix".
- **SHOULD:** explain why in the body and wrap lines at about 72 characters.
- **MUST NOT:** use vague subjects such as `update`, `fix bug`, `change`, or `wip`.

## 2. Type

| Type | Purpose |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Structural improvement without behavior changes |
| `docs` | Documentation only |
| `test` | Add/update tests |
| `style` | Formatting or other non-behavioral changes |
| `chore` | Build configuration, dependencies, maintenance |
| `perf` | Performance improvement |

## 3. Scope

| Scope | Target |
|---|---|
| `backend` | `backend/` |
| `frontend` | `frontend/` |
| `api` | API contracts spanning backend and frontend |
| `ai` | Model API integration and prompts |
| `db` | Schema and migrations |
| `docs` | `docs/` and root documents |
| `infra` | Deployment, CI, environment configuration |
| `deps` | Dependency additions/updates |
| `repo` | Root configuration (`.gitignore`, `.editorconfig`, etc.) |

- **MUST:** use one scope. Split commits spanning major areas; use `api` for inseparable API contract changes.
- Add new scopes to this table first.

## 4. Examples

```text
feat(backend): add event creation API
fix(frontend): fix entry code whitespace handling
feat(api): add version field to proposal response
docs(docs): add common development rules
chore(deps): update fastapi patch version
```

## 5. Breaking Changes

Add `!` and explain API-breaking changes in the footer.

```text
feat(api)!: wrap clothing list in items object

BREAKING CHANGE: GET /api/v1/events/{event_id}/clothing now returns {items, nextCursor} instead of an array
```

## 6. Commit Scope

- **MUST:** keep each commit to one logical change. Never commit a broken build.
- **MUST NOT:** commit secrets, `.env`, build artifacts (`node_modules/`, `.next/`, `.venv/`, `__pycache__/`), or local DB files (`*.db`, `*.sqlite3`).
- Branch commits may be small because PRs use squash merge, but **PR titles must follow this format** as they become squash commit messages.
