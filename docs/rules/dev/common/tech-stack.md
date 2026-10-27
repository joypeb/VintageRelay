# Technology Stack and Environment

## 1. Version Policy

- **MUST:** use the major versions below. Install the latest stable minor/patch at setup and pin with lockfiles.
- **MUST NOT:** use prereleases such as alpha/beta/rc.
- **MUST NOT:** upgrade major versions during the hackathon. Only security patches (patch versions) are allowed.
- Versions were checked against PyPI/npm on 2026-10-27. See backend/frontend READMEs for tool versions.

| Category | Baseline version | Notes |
|---|---|---|
| Python | **3.14** | 3.15.0 was released in early October 2026; use the preceding major for library compatibility. |
| FastAPI | **Latest 0.x (0.162 when checked)** | 1.0 is unreleased. Pin with a lockfile because 0.x minor versions may change behavior. |
| Pydantic | **2.x (2.14 when checked)** | Standard FastAPI dependency. |
| SQLite | **3.x** | Use Python's built-in `sqlite3`. |
| Node.js | **24 LTS** | 26 was not yet labeled LTS when checked (2026-10-27). |
| Next.js | **16.x** | 16.4 line as of October 2026. Use App Router. |
| React | **19.x** | Follow the version recommended by Next.js 16. |
| TypeScript | **6.0.x** | Latest is 7.x, but `typescript-eslint` supports below 6.1. Pin 6.0 until lint tools support 7. |
| Tailwind CSS | **4.x** | 4.3 line as of mid-2026. |
| Astryx | **0.7.x** (`@astryxdesign/core`) | Meta design system. Pin with a lockfile because pre-1.0 minor versions may change behavior. Use chocolate theme. |
| uv | Latest stable | Backend packages and virtual environments. |
| pnpm | **12.x** | Pin in `packageManager`. |

## 2. Monorepo Structure

```text
meta-hackathon-2026/
├─ backend/          # FastAPI app (uv project, pyproject.toml, uv.lock)
├─ frontend/         # Next.js app (pnpm, package.json, pnpm-lock.yaml)
├─ docs/             # Planning, rules, and design documents
├─ AGENTS.md
└─ PROJECT.md
```

- **MUST:** put backend code only in `backend/` and frontend code only in `frontend/`. The root contains documents and shared configuration (`.gitignore`, `.editorconfig`, etc.).
- **MUST NOT:** directly import/reference each other's files across `backend/` and `frontend/`. Their only interface is HTTP ([api-contract.md](api-contract.md)).
- Follow the backend/frontend rules for internal directory structures.

## 3. Package Managers

- **MUST:** use `uv` for backend and `pnpm` for frontend.
- **MUST NOT:** install directly with `pip install` or use frontend `npm`/`yarn`. Do not mix lockfiles.
- **MUST:** commit `uv.lock` and `pnpm-lock.yaml`.
- **SHOULD:** add only necessary dependencies and explain each addition in one PR description sentence.

```bash
cd backend && uv add fastapi        # Add a backend dependency
cd frontend && pnpm add zod         # Add a frontend dependency
```

## 4. Environment Variables

- **MUST:** read environment-specific values (API URL, keys, DB path, CORS origins, etc.) from environment variables, never hardcode them.
- **MUST:** commit `.env.example` in each app directory, listing every required key with an empty/dummy value and a one-line description.
- **MUST NOT:** commit real values in `.env`, `.env.local`, etc. Ignore `.env*` at the root with only `!.env.example` as an exception.
- **MUST:** fail immediately with a clear error at startup if required variables are missing. Do not silently use defaults.
- Use `UPPER_SNAKE_CASE` key names.

| Location | File | Example keys |
|---|---|---|
| backend | `backend/.env` | `DATABASE_URL`, `META_API_KEY`, `CORS_ORIGINS`, `LOG_LEVEL`, `APP_BASE_URL` (proposed; public frontend origin for `entryUrl`) |
| frontend | `frontend/.env.local` | `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_URL` (must equal backend `APP_BASE_URL`) |

## 5. Secrets

- **MUST NOT:** expose API keys, tokens, or passwords in code, commits, PRs, issues, logs, or screenshots.
- **MUST NOT:** store secrets in frontend code. `NEXT_PUBLIC_` values are exposed directly in the browser; use only public values.
- **MUST:** read external service keys, including the Meta Model API key, only from backend environment variables and call models only from the backend.
- **MUST:** revoke/rotate a committed secret immediately and notify the team. Removing it from history is insufficient.
- Share keys privately one-to-one or through deployment platform environment settings, never public messaging channels.

## References

- [Next.js releases (Wikipedia)](https://en.wikipedia.org/wiki/Next.js), [Next.js EOL table (versio.io)](https://www.versio.io/en/product-release-end-of-life-eol-vercel-nextjs.html)
- [FastAPI downloads and versions (pepy.tech)](https://pepy.tech/projects/fastapi)
- [Python 3.15.0 release](https://python.org/downloads/release/python-3150/)
- [TypeScript 7.0 release (gihyo.jp)](https://gihyo.jp/article/2026/07/typescript-7-0), [TypeScript 6.0 (codersera)](https://codersera.com/blog/typescript-6-0-whats-new-breaking-changes-2026/)
- [Astryx getting started](https://astryx.atmeta.com/docs/getting-started), [facebook/astryx](https://github.com/facebook/astryx)
- [Tailwind CSS versions (versionlog)](https://versionlog.com/tailwind-css/), [endoflife.date](https://endoflife.date/tailwind-css)
- [pnpm 11 RC (InfoQ)](https://infoq.com/news/2026/04/pnpm-11-rc-release/), [pnpm 11 (bytes.dev)](https://bytes.dev/archives/484)
