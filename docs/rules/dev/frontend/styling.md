# 스타일링

UI는 Meta 디자인 시스템 [Astryx](https://astryx.atmeta.com/docs/getting-started)를 쓰고, 테마는 **chocolate**이다. Tailwind CSS v4는 Astryx 컴포넌트로 표현하기 어려운 레이아웃 보정에만 쓴다. Astryx는 사전 빌드 CSS(`astryx.css`)로 소비하므로 StyleX 컴파일러 플러그인은 두지 않는다.

## 1. 설정

```css
/* src/styles/globals.css */
@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;

@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/preflight.css' layer(base);
@import '@astryxdesign/core/reset.css';
@import '@astryxdesign/core/astryx.css';
@import '@astryxdesign/theme-chocolate/theme.css';
@import '@astryxdesign/core/tailwind-theme.css'; /* Astryx 토큰 → Tailwind 유틸리티 */
@import 'tailwindcss/utilities.css' layer(utilities);
```

- **반드시:** `globals.css` 첫 줄의 `@layer` 순서 선언을 유지한다. 순서가 깨지면 Astryx 컴포넌트 스타일이 Tailwind 유틸리티를 덮어쓴다.
- **반드시:** 앱 루트는 `src/app/providers.tsx` 의 `Theme` + `LinkProvider`(Next.js `Link`)로 감싼다.
- **반드시:** 테마 추가·변경은 `pnpm exec astryx theme add <slug>` 로 한다. 생성 파일 `src/astryx-themes.ts` 는 직접 수정하지 않는다. 색상을 바꿔야 하면 `:root` 덮어쓰기가 아니라 테마 확장으로 한다(`pnpm exec astryx docs theme`).
- `postcss.config.mjs` 는 `@tailwindcss/postcss` 플러그인만 둔다. `tailwind.config.js` 는 만들지 않는다.

## 2. 컴포넌트 사용

- **반드시:** 버튼·입력·카드·배지·다이얼로그·레이아웃(`VStack`, `HStack`) 등 Astryx에 있는 UI는 Astryx 컴포넌트를 쓴다. 같은 역할의 컴포넌트를 직접 만들지 않는다.
- **반드시:** 컴포넌트는 개별 경로로 import한다. `import { Button } from '@astryxdesign/core/Button'`
- **반드시:** 쓰기 전에 props를 CLI로 확인한다. `pnpm exec astryx component Button`, 찾기는 `pnpm exec astryx search "<키워드>"`
- **권장:** 간격·정렬은 컴포넌트 props(`gap`, `padding`, `hAlign`)를 먼저 쓰고, 부족할 때만 Tailwind 유틸리티를 `className` 으로 더한다.
- Astryx 템플릿(`astryx template`) 중 StyleX 소스를 쓰는 것은 그대로 쓸 수 없다. 구조만 참고해 컴포넌트 + Tailwind로 옮긴다.
- 에이전트용 Astryx 사용 규칙은 `frontend/AGENTS.md` 의 `ASTRYX` 블록(`astryx init` 이 관리)에 있다.

## 3. 디자인 토큰

- **반드시:** 색상·간격·모서리는 Astryx 토큰 브리지 유틸리티로 쓴다. 예: `bg-body`, `bg-surface`, `text-primary`, `text-secondary`, `border-border`, `bg-success-muted`, `bg-error-muted`
- **금지:** 임의 값 색상(`bg-[#3a7]`), 인라인 `style` 색상, Tailwind 기본 팔레트 색상(`bg-blue-500`). 토큰에 없으면 `bg-[var(--color-...)]` 로 Astryx CSS 변수를 참조한다.
- **금지:** `@apply` 남용. 클래스를 붙일 수 없는 서드파티 마크업 덮어쓰기에만 쓴다.
- **금지:** CSS Modules, styled-components 등 다른 스타일링 방식 혼용. StyleX(`xstyle`)도 컴파일러가 없으므로 쓰지 않는다.
- **권장:** 레이아웃 전용 값(하단 탭 높이 등)이 필요하면 `globals.css` 에 `@theme { --spacing-tabbar: 4rem; }` 처럼 추가한다.

## 4. 모바일 우선

- **반드시:** 기본 클래스는 휴대전화 세로 화면(360~430px) 기준으로 작성한다. `sm:` 이상 브레이크포인트는 데스크톱에서 깨지지 않게 하는 정도로만 쓴다.
- **반드시:** 앱 루트는 `mx-auto max-w-md min-h-dvh` 로 감싸 데스크톱에서도 모바일 폭으로 보이게 한다.
- **반드시:** 하단 탭·하단 고정 버튼은 안전 영역을 고려한다(`pb-[env(safe-area-inset-bottom)]`, 루트 레이아웃 `viewport` 에 `viewportFit: 'cover'`).
- **반드시:** 높이는 `h-screen` 대신 `dvh` 단위(`min-h-dvh`)를 쓴다(모바일 주소창 대응).
- **반드시:** 터치 대상은 최소 44×44px(`min-h-11 min-w-11`)로 만든다.
- **권장:** 입력 필드 글자 크기는 16px 이상(`text-base`)으로 해 iOS 자동 확대를 막는다.

## 5. 클래스 작성

- **반드시:** 클래스 순서는 `prettier-plugin-tailwindcss` 에 맡긴다. 손으로 정렬하지 않는다.
- **반드시:** 조건부 클래스는 `cn()` 유틸(`clsx` + `tailwind-merge`)로만 합친다. 템플릿 문자열 연결은 **금지**.
- **금지:** 동적으로 조립한 클래스 이름(`` `bg-${color}` ``). Tailwind가 감지하지 못한다. 완성된 클래스 문자열을 매핑한다.

```ts
// src/lib/utils/cn.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

```tsx
const STATUS_BADGE_CLASS: Record<ItemStatus, string> = {
  available: 'bg-success-muted text-primary',
  reserved: 'bg-warning-muted text-primary',
  withdrawn: 'bg-muted text-secondary',
};

<span className={cn('rounded-full px-2 py-0.5 text-xs', STATUS_BADGE_CLASS[status])} />
```

- **권장:** 변형(variant)이 3개 이상인 공통 UI는 위처럼 `Record` 매핑으로 관리한다. 별도 variant 라이브러리는 도입하지 않는다.

## 6. 접근성 기본

해커톤이라도 아래는 **반드시** 지킨다.

- 클릭 가능한 요소는 `<button>` 또는 `<Link>` 를 쓴다. `div onClick` **금지**.
- 아이콘만 있는 버튼에는 `aria-label` 을 단다.
- 의류 사진 `<img>`/`next/image` 에는 `alt` 를 넣는다. 사용자 설명이 있으면 그것을, 없으면 "○○님의 의류 사진"처럼 쓴다.
- 모든 입력 필드는 `<label>` 과 연결한다. placeholder만으로 라벨을 대신하지 않는다.
- 상태(교환 가능·확정·무효, 응답 상태)를 색만으로 구분하지 않고 텍스트 라벨을 함께 표시한다.
- 포커스 표시를 없애지 않는다(`outline-none` 단독 사용 금지, `focus-visible:ring-2` 등으로 대체).
- 모달·바텀시트는 열릴 때 포커스를 안으로 옮기고 `Esc`·배경 탭으로 닫히며 `role="dialog"`, `aria-modal="true"` 를 단다. Astryx의 다이얼로그·시트 컴포넌트를 우선 쓰고, 없으면 네이티브 `<dialog>` 를 쓴다.
- 폴링으로 바뀌는 중요한 상태 변화(교환안 무효화, 전원 동의 완료)는 `aria-live="polite"` 영역에 알린다.
- 본문 텍스트 대비는 WCAG AA(4.5:1)를 목표로 토큰 색을 정한다.
- 행사 종료 등으로 비활성화한 버튼은 `disabled` 속성을 쓰고 비활성 이유를 근처 텍스트로 보여준다.
