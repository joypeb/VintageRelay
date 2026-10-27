# Code Style

## 1. TypeScript

- **MUST:** enable `"strict": true` and `"noUncheckedIndexedAccess": true` in `tsconfig.json`.
- **MUST NOT:** use explicit/implicit `any` or `@ts-ignore`. If necessary, use `@ts-expect-error reason`.
- **MUST NOT:** use unjustified assertions (`as Foo`). Validate/narrow external input (`localStorage`, URL parameters, besides API responses). Accept unknown values as `unknown`.
- **MUST NOT:** use non-null assertion `!`. Use optional chaining or early returns.
- **MUST:** define fixed string sets such as server statuses as string literal unions, not `enum`.
- **SHOULD:** use `type` for object shapes; use `interface` only when extension is needed.
- **SHOULD:** use discriminated unions for state-dependent fields and exhaustiveness checks with `never` in `switch`.

```ts
export type TradeStatus = 'pending' | 'confirmed' | 'invalidated' | 'rejected' | 'cancelled';

function statusLabel(status: TradeStatus): string {
  switch (status) {
    case 'pending': return 'Awaiting consent';
    case 'confirmed': return 'Confirmed';
    case 'invalidated': return 'Invalidated';
    case 'rejected': return 'Rejected';
    case 'cancelled': return 'Cancelled';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
```

> Status values are examples. Align actual values with the shared API contract and finalized DB design.

## 2. Naming

| Target | Rule | Example |
|---|---|---|
| Component file/name | PascalCase | `TradeCycleDiagram.tsx` |
| Hook | `use` + camelCase, same filename | `useTradeQuery.ts` |
| Other module files | kebab-case | `api-error.ts`, `format-date.ts` |
| Variables/functions | camelCase; functions start with verbs | `acceptSuggestion`, `isOrganizer` |
| Boolean | `is/has/can/should` prefix | `canConsent`, `hasEnded` |
| Constants | UPPER_SNAKE_CASE for module-level immutable values | `POLL_INTERVAL_MS` |
| Types | PascalCase, no `I`/`T` prefix | `Trade`, `ClothingItem` |
| Handler props / implementation | `onXxx` / `handleXxx` | `onConfirm`, `handleConfirm` |

- **MUST:** use consistent domain names throughout code: `event`, `participant`, `item` (clothing), `intent`, `trade` (proposal), `suggestion` (alternative), `consent`, `preference`.
- **MUST NOT:** use meaningless abbreviations (`tr`, `itm`, `data2`).

## 3. Components

- **MUST:** use function declarations and named exports. `export default` only for Next.js-required files (`page`, `layout`, `error`, `not-found`, `loading`).
- **MUST:** define `XxxProps` immediately above its component.
- **MUST:** export one component per file. Local helper components may remain unexported.
- **MUST NOT:** call `fetch` directly in components. Use query hooks from [data-fetching.md](data-fetching.md).
- **MUST NOT:** copy server data into `useState` for synchronization. Use query results directly.
- **SHOULD:** consider splitting components over 150 lines.
- **SHOULD:** use `useEffect` only to synchronize external systems; calculate derived values during render.

```tsx
type ConsentButtonsProps = {
  disabled: boolean;
  onConsent: () => void;
  onReject: () => void;
};

export function ConsentButtons({ disabled, onConsent, onReject }: ConsentButtonsProps) {
  return (
    <HStack gap={2}>
      <Button label="Reject" isDisabled={disabled} onClick={onReject} />
      <Button label="Consent" variant="primary" isDisabled={disabled} onClick={onConsent} />
    </HStack>
  );
}
```

## 4. Import Order

Use ESLint `import/order` (`eslint-plugin-import` in eslint-config-next). Separate groups with blank lines:

1. `react`, `next/*`
2. External packages.
3. Internal alias `@/*`.
4. Relative paths `./`, `../`.
5. Style/type imports follow group rules; **must** use `import type` for type-only imports.

- **MUST:** import internal modules through `@/`. **No** relative paths ascending two or more levels, such as `../../..`.
- **MUST NOT:** use barrel files (`index.ts` re-exports). Import direct paths.

## 5. Lint and Format Configuration

- **MUST:** use ESLint flat config (`eslint.config.mjs`). Next.js 16 removed `next lint`; run `eslint .` directly.
- **MUST:** format with Prettier and disable ESLint formatting rules (`eslint-config-prettier`).

```js
// eslint.config.mjs
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'import/order': ['error', {
        groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
        pathGroups: [
          { pattern: '{react,next,next/**}', group: 'builtin', position: 'before' },
          { pattern: '@/**', group: 'internal' },
        ],
        pathGroupsExcludedImportTypes: ['react', 'next'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc' },
      }],
    },
  },
  globalIgnores(['.next/**', 'node_modules/**', 'coverage/**']),
]);
```

```json
// .prettierrc
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/styles/globals.css",
  "tailwindFunctions": ["cn"]
}
```

If options differ from documentation for the actual installed versions, prioritize that documentation and update these examples.
