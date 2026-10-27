# Vintage Relay Frontend

Next.js 16 + [Astryx](https://astryx.atmeta.com/docs/getting-started)(chocolate 테마) + Tailwind CSS v4 모바일 웹.
개발 규칙은 [`docs/rules/dev/frontend/`](../docs/rules/dev/frontend/README.md)를 따른다.

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

PR 전 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`를 통과시킨다.
Astryx 컴포넌트는 `pnpm exec astryx search "<키워드>"`, `pnpm exec astryx component <Name>`으로 찾는다.
