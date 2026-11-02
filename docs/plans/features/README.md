# Feature Plans (015–021)

One document per roadmap feature from the [2026-11-02 app flow redesign](../../superpowers/specs/2026-11-02-app-flow-redesign-design.md#6-roadmap-spec-kit-features-in-order). Each document says what the feature is, which documents and code to read for its backend and frontend work, what is already decided, and the exact input for `/speckit-specify`. Open the feature's document, follow its **Spec Kit run** section, and you have everything needed to build that feature end to end.

## 1. Order

| # | Document | Area | Depends on |
|---|---|---|---|
| 015 | [App shell: landing event list and bottom tabs](015-app-shell.md) (includes `/impeccable init`) | FE | — |
| 016 | [Home grid and item detail](016-home-and-item-detail.md) | FE | 015 |
| 017 | [My items: list, detail, edit, delete](017-my-items-edit-delete.md) | BE + FE | 015 |
| 018 | [Background AI clothing analysis](018-ai-clothing-analysis.md) | BE + FE | 017 |
| 019 | [AI search](019-ai-search.md) | BE + FE | 016, 018 |
| 020 | [Exchange requests and proposals](020-exchange-requests.md) | BE + FE | 016, 017 |
| 021 | [Cancel and confirmed handover view](021-cancel-and-handover.md) | BE + FE | 020 |

Feature numbers are roadmap IDs. Spec Kit assigns the next free `specs/0NN-*` number, which matches as long as no other spec is created in between; if it differs, keep the roadmap ID in the spec title.

## 2. Read for Every Feature

| Document | Why |
|---|---|
| [AGENTS.md](../../../AGENTS.md) | Language rules, TDD, Spec Kit delegation, review before commit/PR, core exchange rules |
| [PROJECT.md](../../../PROJECT.md) | Product overview |
| [App flow redesign](../../superpowers/specs/2026-11-02-app-flow-redesign-design.md) | Approved direction, decisions, builder's calls, roadmap |
| [Screen flow](../../flows/screen-flow-v1.md) and [mockup v2](../../flows/mockup-flow-v2.html) | Screen IDs and navigation |
| [API contract](../../rules/dev/common/api-contract.md) | Sole source of truth for HTTP format, auth, errors, idempotency |
| [API README](../api/README.md) | Check order, state transitions, input limits |
| [Common dev rules](../../rules/dev/common/README.md) | Code style, logging, testing, Git |
| Backend work: [backend rules](../../rules/dev/backend/README.md) | Do not read frontend rules |
| Frontend work: [frontend rules](../../rules/dev/frontend/README.md) and [frontend/AGENTS.md](../../../frontend/AGENTS.md) (Next.js and Astryx) | Do not read backend rules |
| `PRODUCT.md` (created in 015 by `/impeccable init`) | Product truth for the Impeccable design skill on frontend work |

## 3. Spec Kit Run (Same for Every Feature)

1. **Branch:** start from the latest `main` (`git switch -c <prefix>/<area>-<name> origin/main`, see [git-workflow.md](../../rules/dev/common/git-workflow.md)).
2. **`/speckit-specify`:** paste the feature document's *Specify input*. It already names the source documents, so the spec stays in sync with the plans.
3. **`/speckit-clarify`:** ask only the feature document's *Open questions*; everything under *Already decided* is settled.
4. **`/speckit-plan`:** delegate codebase research to the Paseo `explorer` profile first, using the feature document's *Existing code* list as the starting point.
5. **`/speckit-tasks`**, then **`/speckit-analyze`** with the Paseo `advisor` profile cross-checking spec, plan, tasks, and the API contract.
6. **`/speckit-implement`:** per task, `test-author` (Red) → `implementer-be` or `implementer-fe` (Green → Refactor) → `commit-reviewer` → commit. Backend tasks before the frontend tasks that call them. Boilerplate only through `scaffolder`.
7. **Frontend UI:** run `/impeccable critique` or `audit` on new or changed screens before review, within the Astryx rules ([frontend README](../../rules/dev/frontend/README.md#design-skill-impeccable)).
8. **Checks** before every report and commit:
   - Backend: `cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`
   - Frontend: `cd frontend && pnpm lint && pnpm typecheck && pnpm test` (`pnpm build` before the PR)
9. **PR:** `pr-reviewer` → PR (Changes / Verification / Notes, "API change" when the contract changes) → English review comments → CI green → squash merge.
10. **Keep plans true:** if the implementation deviates from `docs/plans/api/*` or the AI features doc, update those documents in the same PR (lesson from 012–014), and mark the feature row below as done.

## 4. Status

| # | Status |
|---|---|
| 015 | Not started |
| 016 | Done |
| 017 | Not started |
| 018 | Not started |
| 019 | Not started |
| 020 | Not started |
| 021 | Not started |
