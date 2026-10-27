# Git Workflow

Use a simple GitHub Flow for the hackathon: one `main` branch and short-lived working branches.

## 1. Branches

- **MUST:** keep `main` runnable and deployable.
- **MUST NOT:** push directly or force-push to `main`. Enable GitHub branch protection requiring PRs and blocking direct pushes.
- **MUST:** start all work on a new branch from `main`.

| Prefix | Purpose | Example |
|---|---|---|
| `feature/` | Features | `feature/backend-event-create` |
| `fix/` | Bug fixes | `fix/frontend-entry-code-input` |
| `docs/` | Documentation | `docs/common-dev-rules` |
| `chore/` | Configuration, dependencies, deployment | `chore/infra-deploy-setup` |
| `refactor/` | Structural improvements | `refactor/backend-cycle-finder` |

- **MUST:** use `prefix/area-short-description` with lowercase English `kebab-case`. Use a scope from [git-commit.md](git-commit.md) as the area.
- **SHOULD:** keep branches small enough to merge in a day; long-lived branches increase conflicts.
- **SHOULD:** follow changes to `main` frequently using `git pull --rebase origin main` (only on a personal branch before pushing).
- **MUST:** delete merged branches.

## 2. Pre-Commit Checks

Pass the relevant checks before commits or PRs. See backend/frontend rules for exact commands.

| Area | Required | Examples |
|---|---|---|
| backend | Format, lint, types, tests | `uv run ruff format`, `uv run ruff check`, `uv run mypy app`, `uv run pytest` |
| frontend | Lint, types, tests | `pnpm lint`, `pnpm typecheck`, `pnpm test` (`pnpm build` before PRs) |
| docs | Visually inspect links/tables | - |

- **MUST NOT:** merge a PR with failing checks or remove/skip tests to make it pass.
- **MUST:** inspect `git diff --staged` for secrets, debug code, and unnecessary files.

## 3. Pull Requests

- **MUST:** use the commit format (`type(scope): subject`) for PR titles; they become squash commit messages.
- **MUST:** write PR titles, descriptions, and comments in English, including all three sections below.

```markdown
## Changes
- What changed

## Verification
- Checks run and manual verification steps (attach mobile screenshots for screen changes)

## Notes
- API changes, related documents, and open decisions
```

- **SHOULD:** keep PRs within 300 changed lines (excluding lockfiles). Separate backend/frontend PRs where practical.
- **MUST:** state "API change" in the description and update [api-contract.md](api-contract.md) in the same PR when changing the API contract.
- **SHOULD:** open a draft PR when sharing work in progress.

## 4. Review

- **SHOULD:** obtain one teammate approval before merging. When time is short, self-merge after passing checks is allowed; notify the team afterward.
- **MUST:** obtain at least one review and avoid self-merge for API contracts, DB schemas, exchange confirmation/cancellation/concurrency, authentication/authorization, and secret handling changes.
- **SHOULD:** prioritize correctness (exchange rule violations, duplicate confirmation), then security (permissions, sensitive data), then readability. Do not block on personal preferences.
- **SHOULD:** respond to review requests within 30 minutes.

## 5. Merge

- **MUST:** use **Squash and merge**. Disable merge commits and rebase merges in GitHub settings.
- **MUST:** pass checks against the latest `main` immediately before merging.
- **MUST:** if a merge breaks `main`, the PR author fixes or reverts it immediately. Prefer reverting if a fix will take time.
