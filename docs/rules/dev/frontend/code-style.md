# 코드 스타일

## 1. TypeScript

- **반드시:** `tsconfig.json` 에 `"strict": true`, `"noUncheckedIndexedAccess": true` 를 켠다.
- **금지:** `any`(명시·암시 모두), `@ts-ignore`. 정말 필요하면 `@ts-expect-error 사유` 를 쓴다.
- **금지:** 근거 없는 타입 단언(`as Foo`). 외부 입력(API 응답 외 `localStorage`, URL 파라미터)은 검증 후 좁힌다. 모르는 값은 `unknown` 으로 받는다.
- **금지:** non-null 단언 `!`. 옵셔널 체이닝이나 조기 반환으로 처리한다.
- **반드시:** 서버 상태 값처럼 정해진 문자열 집합은 문자열 리터럴 유니온으로 정의한다. `enum` 은 쓰지 않는다.
- **권장:** 객체 형태는 `type` 으로 통일한다. `interface` 는 확장이 필요할 때만 쓴다.
- **권장:** 상태별로 필드가 다르면 판별 유니온으로 표현하고 `switch` 에서 `never` 로 누락을 검사한다.

```ts
export type TradeStatus = 'pending' | 'confirmed' | 'invalidated' | 'rejected' | 'cancelled';

function statusLabel(status: TradeStatus): string {
  switch (status) {
    case 'pending': return '동의 대기';
    case 'confirmed': return '확정';
    case 'invalidated': return '무효';
    case 'rejected': return '거절됨';
    case 'cancelled': return '취소됨';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
```

> 위 상태 값은 예시다. 실제 값은 공통 API 계약과 DB 설계가 확정되면 그에 맞춘다.

## 2. 네이밍

| 대상 | 규칙 | 예 |
|---|---|---|
| 컴포넌트 파일·이름 | PascalCase | `TradeCycleDiagram.tsx` |
| 훅 | `use` + camelCase, 파일도 동일 | `useTradeQuery.ts` |
| 그 외 모듈 파일 | kebab-case | `api-error.ts`, `format-date.ts` |
| 변수·함수 | camelCase, 함수는 동사로 시작 | `acceptSuggestion`, `isOrganizer` |
| boolean | `is/has/can/should` 접두사 | `canConsent`, `hasEnded` |
| 상수 | UPPER_SNAKE_CASE (모듈 최상위 불변값) | `POLL_INTERVAL_MS` |
| 타입 | PascalCase, `I`/`T` 접두사 금지 | `Trade`, `ClothingItem` |
| 이벤트 핸들러 props / 구현 | `onXxx` / `handleXxx` | `onConfirm`, `handleConfirm` |

- **반드시:** 도메인 용어는 코드 전체에서 하나로 통일한다: 행사 `event`, 참가자 `participant`, 의류 `item`, 의향 `intent`, 교환안 `trade`, 대체 제안 `suggestion`, 동의 `consent`, 취향 `preference`.
- **금지:** 의미 없는 약어(`tr`, `itm`, `data2`).

## 3. 컴포넌트 작성

- **반드시:** 함수 선언형 + named export. `export default` 는 Next.js가 요구하는 파일(`page`, `layout`, `error`, `not-found`, `loading`)에서만 쓴다.
- **반드시:** props 타입은 컴포넌트 바로 위에 `XxxProps` 로 정의한다.
- **반드시:** 파일 하나에 export 컴포넌트 하나. 보조 컴포넌트는 같은 파일 안에서 export하지 않고 쓴다.
- **금지:** 컴포넌트 안에서 `fetch` 직접 호출. 데이터는 [data-fetching.md](data-fetching.md)의 쿼리 훅으로 가져온다.
- **금지:** 서버 데이터를 `useState` 로 복사해 동기화하는 패턴. 쿼리 결과를 그대로 쓴다.
- **권장:** 컴포넌트가 150줄을 넘으면 분리를 검토한다.
- **권장:** `useEffect` 는 외부 시스템 동기화에만 쓴다. 파생 값은 렌더 중 계산한다.

```tsx
type ConsentButtonsProps = {
  disabled: boolean;
  onConsent: () => void;
  onReject: () => void;
};

export function ConsentButtons({ disabled, onConsent, onReject }: ConsentButtonsProps) {
  return (
    <div className="flex gap-2">
      <Button variant="secondary" disabled={disabled} onClick={onReject}>거절</Button>
      <Button disabled={disabled} onClick={onConsent}>동의</Button>
    </div>
  );
}
```

## 4. import 순서

ESLint `import/order`(eslint-config-next에 포함된 `eslint-plugin-import`)로 자동 정렬한다. 그룹 순서와 그룹 사이 빈 줄:

1. `react`, `next/*`
2. 외부 패키지
3. 내부 별칭 `@/*`
4. 상대 경로 `./`, `../`
5. 스타일·타입 전용 import(`import type`)는 각 그룹 규칙을 따르되 `import type` 을 **반드시** 사용한다.

- **반드시:** 내부 모듈은 `@/` 별칭으로 import한다. `../../..` 처럼 두 단계 이상 올라가는 상대 경로는 **금지**.
- **금지:** 배럴 파일(`index.ts` 재export). 경로를 직접 import한다.

## 5. 린트·포맷 설정

- **반드시:** ESLint flat config(`eslint.config.mjs`)를 쓴다. Next.js 16에서 `next lint` 는 제거되었으므로 `eslint .` 를 직접 실행한다.
- **반드시:** Prettier로 포맷하고 ESLint에서는 포맷 규칙을 끈다(`eslint-config-prettier`).

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

설정 파일의 세부 옵션은 실제 설치 버전 문서와 다르면 문서를 우선하고 이 예시를 갱신한다.
