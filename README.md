# Vintage Relay

Vintage Relay is a mobile web app for a **clothing exchange corner** at neighborhood events and small flea markets. An organizer creates an event and shares a QR code or entry code. Participants join, register garments with photos, browse and search other people's garments, and send exchange requests that name the garment they would give. The app links these requests into **two-person swaps and three-person cycles**, and each exchange is confirmed only after every participant gives final consent.

AI helps people find garments. It never decides for them. See [PROJECT.md](PROJECT.md) for the product overview and [docs/](docs/README.md) for plans, rules, and screen flows.

## Features

- **Events:** create an event (it is active right away), get a QR code and entry code, join with either one, and close the event as organizer.
- **Clothing:** upload 1–10 photos and enter category, title, description, and optional measurements in inches. Edit or withdraw garments later.
- **AI clothing analysis:** after each save, the backend estimates colors, pattern, material, style tags, visible details, and points to check in person. The UI labels all of this as estimated by AI.
- **Search:** type a natural-language query such as "green nylon workwear jacket, chest around 21 inches". AI turns it into filters, and regular code ranks the results. Manual filters stay available if AI fails.
- **Exchange requests:** request a garment by offering one of your own. The owner can accept or decline.
- **Proposals:** two-person and three-person exchange cycles are detected automatically. All participants consent to the same proposal version before it is confirmed.
- **Cancellation and handover:** a party can cancel a confirmed exchange before the event closes, and the handover view shows who gives what to whom.

## Tech Stack

| Area | Technologies |
|---|---|
| Backend | Python 3.14, FastAPI, SQLAlchemy 2, Alembic, SQLite, Pydantic / pydantic-settings, Pillow (image verification and normalization), httpx (model API client) |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, [Astryx](https://astryx.atmeta.com/docs/getting-started) design system (chocolate theme), StyleX, Tailwind CSS v4, TanStack Query, Zod, qrcode.react |
| Testing and quality | pytest, Ruff, mypy (strict); Vitest, Testing Library, ESLint, Prettier |
| API tooling | Postman collections and environments in [`postman/`](postman/) |
| Infrastructure | Docker / Docker Compose (one backend service plus a SQLite volume), GitHub Actions CI, uv, pnpm |

## AI in the Product

The backend makes every model call. The frontend never talks to the model and never sees the API key.

| | |
|---|---|
| Model | **Muse Spark 1.3** (`muse-spark-1.3`) through the **Meta Model API** (OpenAI-compatible Chat Completions, `https://api.meta.ai/v1`) |
| Capabilities used | Image understanding (multimodal input) and structured JSON output (`response_format: json_schema`) |
| Client | [`backend/app/ai/client.py`](backend/app/ai/client.py), an httpx client with timeouts, one retry, and a concurrency limit |

### Where AI is used

1. **Clothing analysis** ([`backend/app/services/clothing_analysis.py`](backend/app/services/clothing_analysis.py))
   - Runs as a FastAPI background task after a garment is registered or its content is edited, so registration never waits for it.
   - Sends the first 3 photos (as base64 data URLs) plus the owner's category, title, description, and measurements.
   - Returns colors (from a fixed vocabulary), pattern, material estimate, style tags, visible details, a size label only if a visible tag shows one, and an "uncertainties" list of things to check in person.
   - Results are versioned against the garment's `contentVersion`. If the garment changed while the model was working, the result is discarded.
2. **Search interpretation** (`POST /api/v1/events/{event_id}/search/interpretation`, [`backend/app/services/search.py`](backend/app/services/search.py))
   - Turns free text into `SearchConditions`: category, colors, measurement ranges, style keywords, and phrases the model could not map (`unrecognized`).
   - Uses `reasoning_effort: "minimal"` for speed. The server then validates the output, dropping unknown colors, out-of-range measurements, and bad keywords.

### Where AI is not used

The following run on regular, deterministic code:

- Search ranking (scoring by category, color, measurements, and keywords)
- Two- and three-person cycle detection ([`backend/app/domain/matching.py`](backend/app/domain/matching.py))
- Permissions, proposal versions, consent, duplicate-confirmation prevention, cancellation, and event closure

### Guardrails

- AI never creates, changes, or withdraws an exchange request, and never consents on anyone's behalf.
- AI output is shown as an estimate. The output schema has no fields for price, authenticity, or fit verdicts. Owner-entered fields are facts and are never overwritten.
- Owner text and search text go into the prompt as quoted data, and the prompt tells the model to ignore any instructions inside them. Responses are validated with Pydantic. Invalid output counts as a failure.
- If AI fails, the analysis is marked `failed` (AI estimates are hidden) or search returns `503 AI_UNAVAILABLE` (the UI falls back to manual filters).
- Logs never include API keys, photo bytes, or full user text.

Full specification: [docs/plans/ai-features-v1.md](docs/plans/ai-features-v1.md).

## AI in the Development Process

This project was built mostly by AI coding agents, with a human making the product decisions and reviewing the work.

- **Coding agents:** Claude Code (Claude Opus) wrote most of the code and documentation. The repository is also set up for Codex and OpenCode ([`AGENTS.md`](AGENTS.md), `.agents/`, `.opencode/`).
- **Spec-driven development:** [GitHub Spec Kit](https://github.com/github/spec-kit) skills (`/speckit-specify`, `plan`, `tasks`, `analyze`, `implement`). Each feature has a spec, plan, and task list under [`specs/`](specs/) (001–023).
- **Multi-agent orchestration:** [Paseo](https://paseo.sh) runs role-specific agents: explorer, advisor, test-author, backend and frontend implementers, scaffolder, commit reviewer, and PR reviewer.
- **Test-driven development:** each task runs a Red → Green → Refactor cycle. A test-author agent writes a failing test, and an implementer agent makes it pass.
- **AI code review:** before every commit and PR, an AI reviewer agent reviews the diff with Open Code Review (`ocr delegate`). Critical and High findings must be fixed before merging.
- **Design:** the Impeccable skill (`.agents/skills/impeccable/`) guided UI critique and polish.
- **API tooling:** Postman agent skills ([`postman/skills/`](postman/skills/)) cover API collections and tests.

## Getting Started

### Backend

```bash
cd backend
uv sync
export AI_API_KEY=<your Meta Model API key>
uv run alembic upgrade head
uv run fastapi dev app/main.py   # http://localhost:8000
```

Or run it with Docker. Compose fills `AI_API_KEY`, `APP_BASE_URL`, `LOG_LEVEL`, and `LOG_FORMAT` from the root `.env` (a local `uv run` ignores that file, so export variables instead):

```bash
cp .env.example .env   # from the repo root; then set AI_API_KEY
docker compose up --build
```

### Frontend

```bash
cd frontend
corepack enable
pnpm install
cp .env.example .env.local   # NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
pnpm dev                     # http://localhost:3000
```

### Checks

```bash
cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the same checks on every PR and on pushes to `main`.

## Repository Layout

```
backend/    FastAPI app (api, services, repositories, models, domain, ai), Alembic migrations, tests
frontend/   Next.js mobile web app
docs/       Domain background, rules, API/DB/AI plans, screen flows
specs/      Spec Kit artifacts per feature (spec, plan, tasks)
postman/    API collections, environments, fixtures
```

## License

[MIT](LICENSE)
