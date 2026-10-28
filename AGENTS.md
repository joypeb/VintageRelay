# Project Instructions

- Agent replies to the user must be in Korean. All application UI text, user-facing API messages, AI-generated application copy, project documents, code comments and docstrings, review results, PR titles/descriptions/comments, and Git commit messages must be in English.
- Vintage Relay is a mobile web prototype for a **clothing exchange corner** at neighborhood events or small flea markets. Creating an event also registers the organizer as a participant and stores that participant ID as the event's organizer ID. Events become active immediately; participants can join before or during the event using a QR code or entry code.
- See [PROJECT.md](PROJECT.md) for the overview and `docs/` for details.
  - **Planning and domain knowledge (`docs/domain/`):** background and rationale, including [idea.md](docs/domain/idea.md).
  - **Business and exchange rules (`docs/rules/`):** core exchange rules and detailed policies.
  - **Development plans and design (`docs/plans/`):** [initial development plan](docs/plans/vintage-relay-plan-v1.md), [database design](docs/plans/database-design-v1.md), [per-function API specifications](docs/plans/api/README.md), and [AI features](docs/plans/ai-features-v1.md).
  - **Screens and interactions (`docs/flows/`):** [screen flow specification](docs/flows/screen-flow-v1.md) and [interactive mockup](docs/flows/mockup-flow-v1.html).
  - **Development rules (`docs/rules/dev/`):** code style, error handling, logging, and Git rules.
- If early ideas conflict with later decisions, prioritize the latest user decisions and the initial development plan.

## Which Development Rules to Read

Before writing code, read and follow only the rules for the area being changed.

- **Backend (`backend/`):** [`docs/rules/dev/common/`](docs/rules/dev/common/README.md) + [`docs/rules/dev/backend/`](docs/rules/dev/backend/README.md).
- **Frontend (`frontend/`):** [`docs/rules/dev/common/`](docs/rules/dev/common/README.md) + [`docs/rules/dev/frontend/`](docs/rules/dev/frontend/README.md). Do not read `docs/rules/dev/backend/`.
- **Documentation and Git:** read only `docs/rules/dev/common/`.
- `docs/rules/dev/common/api-contract.md` is the sole source of truth for the API contract shared by backend and frontend.

## Code Review Before Commits and PRs

- Before an agent commits or creates/updates a PR, it **must** delegate an OCR delegate review to a Paseo subagent and wait for the results. Use Paseo's `commit-reviewer` profile before committing and the `pr-reviewer` profile before PR work. Run separate reviews for each stage.
- This procedure applies to agents reading these instructions. It is not a Git hook that detects or blocks Git commands run directly by the user.
- At the start of a review, use Paseo's `list_profiles` to check the latest profile for the current stage (`commit-reviewer` or `pr-reviewer`) and its notes. Do not hardcode models or settings. `create_agent` has no `profile` argument; pass the profile's provider/model, modeId, thinkingOptionId, and featureValues as the execution settings.
- Run the reviewer in the same Paseo workspace as the files under review. Uncommitted changes are not copied into a separate worktree, so never review pre-commit changes from another worktree.
- Provide the review stage, target files, base branch and HEAD commit, relevant requirements, checks run and their results. If a PR exists, also provide its number, URL, and actual base/head.
- The reviewer must not edit code or documents, commit, push, create PRs, or post comments. It only reviews and returns findings to the requesting agent. **A delegated reviewer must not create another reviewer.**
- If Paseo or the required profile (`commit-reviewer` or `pr-reviewer`) is unavailable, do not count the review as complete. Report the reason and stop commit/PR work.

### Review Scope and OCR

- **Before committing:** use `ocr delegate preview --format json` to inspect local changes and review the exact files and content to be committed. The default preview includes staged, unstaged, and untracked changes. For partially staged files, inspect the index and `git --no-pager diff --cached --no-ext-diff --no-textconv --no-color` to distinguish actual commit content.
- **Before PR work:** select all committed changes from the actual PR base to HEAD with `ocr delegate preview --format json --from <base> --to HEAD`. For existing PRs, check the actual base/head and exclude local changes that are outside the PR.
- Run `ocr delegate rule --format json <path...>` for the selected files, then read the diff and related code following the `open-code-review-delegate` skill. Use `git --no-pager` for Git commands.
- Apply the reading scope above to each file and read the relevant documents directly. Use the common API contract and do not report undecided matters as settled rules.
- Write review results and comments in **English**. Each finding must include severity, file/line, triggering conditions and impact, and a suggested fix. Prioritize verifiable bugs, security issues, and regressions.
- Record every preview file as reviewed or skipped with a reason, including files outside the commit scope. Report total/reviewed/skipped counts and coverage. Never claim tests passed if they were not run.
- Resolve Critical/High findings before committing or PR work. The working agent makes fixes, runs relevant checks, and obtains reviewer re-review. If content changes during review, review the changed content again.

### Posting PR Review Comments

- After the pre-PR review, create the PR; for existing PRs, verify the updated head. The requesting agent then **posts English review comments**. Posting is part of a user-requested PR task.
- Immediately before posting, confirm the reviewed HEAD matches the latest PR head commit. If they differ, review the latest changes again.
- Post findings inline on changed lines of the reviewed commit when possible. Otherwise, post a general comment containing file/line references.
- The summary comment must include the reviewed commit, scope and coverage, findings, and verification results/limitations. Post a summary even with no findings. Do not duplicate the same findings for the same commit.
- Verify the posting result and comment URL. If permissions or authentication prevent posting, report the failure and provide an English comment draft; do not count posting as complete.

## Core Exchange Rules

- Participants can register multiple garments and take part in multiple exchanges using different garments. Each participant gives one garment and receives one garment per exchange; bundles are excluded.
- The first version finds two-person swaps and three-person cycles based on explicit participant intents. A garment cannot be confirmed in multiple exchanges.
- Suggest an alternative garment when offering another garment owned by the participant would complete an exchange. Never change an intent without acceptance; acceptance is not final consent.
- Confirmation requires all participants to give final consent to the same proposal version. Do not reuse consent from proposals invalidated by clothing/intent changes or conflicts.
- Before the event closes, a party may cancel an entire confirmed exchange. Related garments that have not been physically handed over become available again. Confirmation and physical handover are separate.
- Once the organizer closes the event, no further exchange actions are allowed. Canceling unconfirmed proposals and retaining confirmed records for viewing at closure is a proposal in the initial plan.

## AI and System Responsibilities

- AI interprets clothing photos/descriptions and natural-language preferences, then suggests candidates, reasons, and points to check. Users can also select candidates manually.
- Regular code handles cycle detection and alternative garment suggestions. The server and database also enforce permissions, proposal versions, event state, and prevention of duplicate garment confirmation.
- AI must not automatically change intents or provide final consent on a participant's behalf. It must not state facts that cannot be verified from photos.

## Open Decisions

Cancellation after partial physical handover, handover completion records, session recovery, photo/event record retention, participant/garment limits, and proposal ordering remain undecided. Specifying an offered garment when recording an intent is an initial design proposal. API path structure, bearer-token authentication, the 403/404 authorization policy (404 only to hide private resources), and feature error codes are decided in `docs/rules/dev/common/api-contract.md`. The proposal re-proposal suppression rule is decided in `docs/plans/api/11-proposals.md`; per-function request/response details are drafted in `docs/plans/api/` and `docs/plans/ai-features-v1.md`, where items marked proposed still need agreement. Do not treat open decisions as settled rules.

<API_TASKS>
Before responding to any non-trivial API engineering task — designing, implementing, mocking, testing, monitoring, documenting, or deploying an API or Postman Flow — read `postman/skills/api-engineer/SKILL.md` and follow it. It is the default entry point for API work in this repository. Pure questions and trivial one-line edits do not need it.
</API_TASKS>
