# Frontend Development Rules

Rules for Vintage Relay's **mobile web** frontend. This hackathon prototype uses a practical minimum.

> **Reading scope:** frontend contributors read only `docs/rules/dev/common/` and this directory (`frontend/`). **Do not read backend rules.** Align with the server only through the [shared API contract](../common/api-contract.md).

Rules have three levels.

- **MUST:** violations are rejected in review.
- **MUST NOT:** prohibited; explain necessary exceptions in code comments.
- **SHOULD:** default guidance with contextual exceptions.

## Technology Stack and Versions

Latest stable versions checked against npm and Node.js releases on 2026-10-27. Pin actual installed versions in `package.json` at project creation and update this table if they differ.

| Item | Version | Notes |
|---|---|---|
| Node.js | 24.x LTS (Krypton, 24.22.1 when checked) | Pin with `.nvmrc`/`engines`. 26.x was not yet labeled LTS. |
| pnpm | 12.x (12.15.0 when checked) | Pin `packageManager`; `corepack enable`. |
| Next.js | 16.x (16.4.3 when checked), App Router | Turbopack by default. Run ESLint CLI directly; `next lint` no longer exists. |
| React / React DOM | 19.x (19.3.1 when checked) | |
| TypeScript | **6.0.x** (6.0.3 when checked) | Latest is 7.0.2, but `typescript-eslint` 8.72.1 supports `<6.1.0`. Pin 6.0 until lint tools support 7. |
| Astryx | 0.7.x (0.7.4 when checked): `@astryxdesign/core`, `@astryxdesign/theme-chocolate`, `@astryxdesign/cli` (dev) | UI components/tokens. Use prebuilt CSS, no StyleX compiler plugin. Peer: `@stylexjs/stylex` 0.19.x. |
| Tailwind CSS | 4.x (4.3.3 when checked) + `@tailwindcss/postcss` | Layout adjustments. Use Astryx token bridge (`tailwind-theme.css`), no `tailwind.config.js`. |
| ESLint | **9.x** (9.39.5 when checked), flat config | `eslint-config-next` 16.x + `typescript-eslint`. Pin 9 because `eslint-plugin-import` 2.32 does not support 10.x and crashes on `import/order`. |
| Prettier | 3.x (3.9.10 when checked) + `prettier-plugin-tailwindcss` 0.8.x | |
| TanStack Query | 5.x (5.105.0 when checked) | Server state |
| Zod | 4.x (4.6.7 when checked) | Form validation |
| Vitest | 5.x (5.0.5 when checked) + Testing Library React 16.x | Playwright 1.6x if needed |

## Contents

| Document | Contents |
|---|---|
| [project-structure.md](project-structure.md) | Directories, app routing/screen IDs, server/client components |
| [code-style.md](code-style.md) | TypeScript strictness, naming, components, imports, lint/format |
| [styling.md](styling.md) | Astryx/theme, Tailwind v4, tokens, conditional classes, accessibility |
| [data-fetching.md](data-fetching.md) | API client, types, TanStack Query, polling, environment |
| [error-handling.md](error-handling.md) | API errors, error/not-found boundaries, messages, form validation |
| [logging.md](logging.md) | Client logging and sensitive data |
| [testing.md](testing.md) | Minimal Vitest/Testing Library strategy |

## Shared Rules (common)

Do not redefine the following in frontend rules.

- Commits, branches, and Git workflow: Git documents in [../common/](../common/).
- API errors, JSON casing, dates: [../common/api-contract.md](../common/api-contract.md).

## Basic Commands

```bash
pnpm dev          # Development server
pnpm build        # Production build
pnpm lint         # eslint .
pnpm format       # prettier --write .
pnpm typecheck    # next typegen && tsc --noEmit
pnpm test         # vitest run
```

**MUST:** pass `pnpm lint && pnpm typecheck && pnpm test` before PRs.
