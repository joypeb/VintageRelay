# Common Development Rules

Shared rules for Vintage Relay's backend (FastAPI/SQLite) and frontend (Next.js/TypeScript/Astryx/Tailwind CSS). This hackathon prototype uses only a practical minimum of rules.

## Reading Scope

- **Backend work:** read only `common/` + `backend/`.
- **Frontend work:** read only `common/` + `frontend/`.
- **Adding/changing APIs:** also check [api-contract.md](api-contract.md).
- Reading the other side's rules is unnecessary. All shared requirements belong in `common/`.

## Rule Labels

- **MUST:** follow without exception.
- **MUST NOT:** prohibited.
- **SHOULD:** follow by default; explain any justified deviation in the PR.

## Contents

| Document | Contents |
|---|---|
| [tech-stack.md](tech-stack.md) | Version policy, monorepo, package managers, environment variables, and secrets |
| [code-style.md](code-style.md) | Language-independent naming, comments, file size, and magic values |
| [api-contract.md](api-contract.md) | REST, JSON casing, errors, status codes, dates, IDs, and pagination (**sole shared contract**) |
| [error-handling-logging.md](error-handling-logging.md) | Error handling, logging principles, and request IDs |
| [git-commit.md](git-commit.md) | Commit message rules |
| [git-workflow.md](git-workflow.md) | Branches, PRs, reviews, merges, and pre-commit checks |
| [testing.md](testing.md) | Shared testing principles |

## Priority

1. Follow [AGENTS.md](../../../../AGENTS.md) and the [initial development plan](../../../plans/vintage-relay-plan-v1.md) for domain/exchange rules.
2. If common and backend/frontend rules conflict, **common rules (especially api-contract.md) take priority**. Whoever finds a conflict updates the documents.
3. Do not present open decisions (session recovery, photo retention, etc.) as settled requirements.
