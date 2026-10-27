# Client Logging

Do not add external log collectors such as Sentry during the prototype. Use only the browser console.

## 1. Console Policy

| Method | Usage | Production build |
|---|---|---|
| `console.error` | Unexpected unrecovered errors (`error.tsx`, `global-error.tsx`, non-`ApiError` exceptions) | Keep |
| `console.warn` | Contract shape mismatch or fallback (e.g. manual selection after AI failure) | Keep |
| `console.log`, `console.debug`, `console.info` | Development debugging | **Remove** |

- **MUST:** restrict ESLint `no-console` to `warn`/`error` (see [code-style.md](code-style.md)). Remove debugging `console.log` before commits.
- **MUST:** strip other console calls in production using `compiler.removeConsole` in `next.config.ts`.

```ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
};

export default nextConfig;
```

- **MUST:** centralize calls through `src/lib/logger.ts` rather than scattering `console.*`. Change only this module when adding a collector later.

```ts
// src/lib/logger.ts
export const logger = {
  warn: (msg: string, ctx?: Record<string, unknown>) => console.warn(`[vr] ${msg}`, ctx ?? ''),
  error: (msg: string, err?: unknown, ctx?: Record<string, unknown>) =>
    console.error(`[vr] ${msg}`, err, ctx ?? ''),
};
```

## 2. What to Record

- **MUST:** write a one-line message identifying the failed operation and attach only identifiers as context, e.g. `logger.error('consent failed', err, { eventId, tradeId, version })`.
- **SHOULD:** log only `code`/`status` from `ApiError`. Do not log expected errors already shown to users (validation, version conflict, event closed).

## 3. Sensitive Data

**Never log**:

- Session tokens, auth headers, cookie values, or entry codes.
- Participant display names, raw preferences/exclusions, or clothing descriptions.
- Photo contents, `File` objects, or full image URLs (may include signed queries).
- Full request/response bodies.

Default to IDs (`eventId`, `tradeId`, `itemId`) and error codes only.
