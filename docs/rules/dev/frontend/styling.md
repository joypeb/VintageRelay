# 스타일링

Tailwind CSS v4를 쓴다. v4는 **CSS-first 설정**이므로 `tailwind.config.js` 를 만들지 않고 CSS 파일 안에서 테마를 정의한다.

## 1. 설정

```js
// postcss.config.mjs
export default { plugins: { '@tailwindcss/postcss': {} } };
```

```css
/* src/styles/globals.css */
@import 'tailwindcss';

@theme {
  /* 색상: 의미 기반 이름 */
  --color-brand: oklch(0.55 0.12 150);
  --color-brand-fg: oklch(0.98 0 0);
  --color-surface: oklch(0.99 0 0);
  --color-muted: oklch(0.55 0 0);
  --color-danger: oklch(0.58 0.2 25);
  --color-warning: oklch(0.8 0.15 85);
  --color-success: oklch(0.6 0.14 150);

  /* 글꼴 */
  --font-sans: 'Pretendard Variable', system-ui, sans-serif;

  /* 하단 탭 높이 등 레이아웃 값 */
  --spacing-tabbar: 4rem;
}
```

- **반드시:** 색상·글꼴·반복되는 레이아웃 값은 `@theme` 의 디자인 토큰으로 정의하고 `bg-brand`, `text-danger` 처럼 토큰 유틸리티로 쓴다.
- **금지:** 임의 값 색상(`bg-[#3a7]`), 인라인 `style` 색상. 토큰에 없으면 토큰을 추가한다.
- **금지:** `tailwind.config.js`, `@apply` 남용. `@apply` 는 서드파티 마크업 덮어쓰기처럼 클래스를 붙일 수 없는 경우에만 쓴다.
- **금지:** CSS Modules, styled-components 등 다른 스타일링 방식 혼용.
- **권장:** 커스텀 유틸리티가 필요하면 `@utility` 로 정의한다.

## 2. 모바일 우선

- **반드시:** 기본 클래스는 휴대전화 세로 화면(360~430px) 기준으로 작성한다. `sm:` 이상 브레이크포인트는 데스크톱에서 깨지지 않게 하는 정도로만 쓴다.
- **반드시:** 앱 루트는 `mx-auto max-w-md min-h-dvh` 로 감싸 데스크톱에서도 모바일 폭으로 보이게 한다.
- **반드시:** 하단 탭·하단 고정 버튼은 안전 영역을 고려한다(`pb-[env(safe-area-inset-bottom)]`, 루트 레이아웃 `viewport` 에 `viewportFit: 'cover'`).
- **반드시:** 높이는 `h-screen` 대신 `dvh` 단위(`min-h-dvh`)를 쓴다(모바일 주소창 대응).
- **반드시:** 터치 대상은 최소 44×44px(`min-h-11 min-w-11`)로 만든다.
- **권장:** 입력 필드 글자 크기는 16px 이상(`text-base`)으로 해 iOS 자동 확대를 막는다.

## 3. 클래스 작성

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
  available: 'bg-success/10 text-success',
  reserved: 'bg-warning/15 text-warning',
  withdrawn: 'bg-muted/10 text-muted',
};

<span className={cn('rounded-full px-2 py-0.5 text-xs', STATUS_BADGE_CLASS[status])} />
```

- **권장:** 변형(variant)이 3개 이상인 공통 UI는 위처럼 `Record` 매핑으로 관리한다. 별도 variant 라이브러리는 도입하지 않는다.

## 4. 접근성 기본

해커톤이라도 아래는 **반드시** 지킨다.

- 클릭 가능한 요소는 `<button>` 또는 `<Link>` 를 쓴다. `div onClick` **금지**.
- 아이콘만 있는 버튼에는 `aria-label` 을 단다.
- 의류 사진 `<img>`/`next/image` 에는 `alt` 를 넣는다. 사용자 설명이 있으면 그것을, 없으면 "○○님의 의류 사진"처럼 쓴다.
- 모든 입력 필드는 `<label>` 과 연결한다. placeholder만으로 라벨을 대신하지 않는다.
- 상태(교환 가능·확정·무효, 응답 상태)를 색만으로 구분하지 않고 텍스트 라벨을 함께 표시한다.
- 포커스 표시를 없애지 않는다(`outline-none` 단독 사용 금지, `focus-visible:ring-2` 등으로 대체).
- 모달·바텀시트는 열릴 때 포커스를 안으로 옮기고 `Esc`·배경 탭으로 닫히며 `role="dialog"`, `aria-modal="true"` 를 단다. 네이티브 `<dialog>` 사용을 **권장**한다.
- 폴링으로 바뀌는 중요한 상태 변화(교환안 무효화, 전원 동의 완료)는 `aria-live="polite"` 영역에 알린다.
- 본문 텍스트 대비는 WCAG AA(4.5:1)를 목표로 토큰 색을 정한다.
- 행사 종료 등으로 비활성화한 버튼은 `disabled` 속성을 쓰고 비활성 이유를 근처 텍스트로 보여준다.
