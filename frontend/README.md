# Vintage Relay Frontend

Mobile web app using Next.js 16 + [Astryx](https://astryx.atmeta.com/docs/getting-started) (chocolate theme) + Tailwind CSS v4. The application UI is in English.
Follow the development rules in [`docs/rules/dev/frontend/`](../docs/rules/dev/frontend/README.md).

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

Pass `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before PRs.
Find Astryx components with `pnpm exec astryx search "<keyword>"` and inspect them with `pnpm exec astryx component <Name>`.
