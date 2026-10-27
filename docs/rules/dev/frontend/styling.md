# Styling

Use Meta's [Astryx](https://astryx.atmeta.com/docs/getting-started) design system with the **chocolate** theme. Tailwind CSS v4 is only for layout adjustments difficult with Astryx components. Consume prebuilt `astryx.css`, without a StyleX compiler plugin.

## 1. Setup

```css
/* src/styles/globals.css */
@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;

@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/preflight.css' layer(base);
@import '@astryxdesign/core/reset.css';
@import '@astryxdesign/core/astryx.css';
@import '@astryxdesign/theme-chocolate/theme.css';
@import '@astryxdesign/core/tailwind-theme.css'; /* Astryx tokens → Tailwind utilities */
@import 'tailwindcss/utilities.css' layer(utilities);
```

- **MUST:** preserve the first-line `@layer` order in `globals.css`; otherwise Astryx styles overwrite Tailwind utilities.
- **MUST:** wrap the app root with `Theme` + `LinkProvider` (Next.js `Link`) in `src/app/providers.tsx`.
- **MUST:** add/change themes with `pnpm exec astryx theme add <slug>`. Do not edit generated `src/astryx-themes.ts`. Change colors by extending themes, not overriding `:root` (`pnpm exec astryx docs theme`).
- Use only `@tailwindcss/postcss` in `postcss.config.mjs`. Do not create `tailwind.config.js`.

## 2. Components

- **MUST:** use Astryx for available UI (buttons, inputs, cards, badges, dialogs, `VStack`/`HStack` layouts). Do not recreate equivalents.
- **MUST:** import individual paths: `import { Button } from '@astryxdesign/core/Button'`.
- **MUST:** inspect props before use: `pnpm exec astryx component Button`; search with `pnpm exec astryx search "<keyword>"`.
- **SHOULD:** prefer component spacing/alignment props (`gap`, `padding`, `hAlign`), adding Tailwind `className` only when needed.
- StyleX-based Astryx templates cannot be used unchanged. Reuse their structure with components and Tailwind.
- Agent Astryx rules are in the `ASTRYX` block of `frontend/AGENTS.md`, managed by `astryx init`.

## 3. Design Tokens

- **MUST:** use Astryx token bridge utilities for colors/spacing/radii: `bg-body`, `bg-surface`, `text-primary`, `text-secondary`, `border-border`, `bg-success-muted`, `bg-error-muted`.
- **MUST NOT:** use arbitrary colors (`bg-[#3a7]`), inline color styles, or Tailwind palette colors (`bg-blue-500`). If no token utility exists, reference Astryx CSS variables with `bg-[var(--color-...)]`.
- **MUST NOT:** overuse `@apply`; reserve it for third-party markup that cannot receive classes.
- **MUST NOT:** mix CSS Modules, styled-components, or other styling approaches. Do not use StyleX (`xstyle`) without its compiler.
- **SHOULD:** define layout-only values (e.g. tab height) in `globals.css`, e.g. `@theme { --spacing-tabbar: 4rem; }`.

## 4. Mobile First

- **MUST:** target portrait phone widths 360–430px with default classes. Use `sm:` and above only to prevent desktop breakage.
- **MUST:** wrap the app in `mx-auto max-w-md min-h-dvh` to retain mobile width on desktop.
- **MUST:** account for safe areas in bottom tabs/fixed buttons (`pb-[env(safe-area-inset-bottom)]`, root viewport `viewportFit: 'cover'`).
- **MUST:** use `dvh` (`min-h-dvh`) instead of `h-screen` for mobile address bars.
- **MUST:** provide touch targets at least 44×44px (`min-h-11 min-w-11`).
- **SHOULD:** use input fonts at least 16px (`text-base`) to prevent iOS auto-zoom.

## 5. Classes

- **MUST:** let `prettier-plugin-tailwindcss` sort classes, not manual ordering.
- **MUST:** merge conditional classes only with `cn()` (`clsx` + `tailwind-merge`). **No** template concatenation.
- **MUST NOT:** dynamically assemble classes (`` `bg-${color}` ``); Tailwind cannot detect them. Map complete class strings.

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

- **SHOULD:** use `Record` mappings as above for shared UI with three or more variants. Do not add variant libraries.

## 6. Accessibility Basics

These rules are **required**, even during the hackathon.

- Use `<button>` or `<Link>` for clickable elements. **No** `div onClick`.
- Add `aria-label` to icon-only buttons.
- Add `alt` to clothing `<img>`/`next/image`: use user descriptions or text such as "Clothing photo by [name]".
- Associate every input with a `<label>`; placeholders do not replace labels.
- Include text labels for states (available/confirmed/invalidated, response status); never rely on color alone.
- Preserve focus indicators (no standalone `outline-none`; replace with `focus-visible:ring-2`, etc.).
- Focus inside open modals/sheets, close on `Esc` or backdrop tap, and set `role="dialog"`, `aria-modal="true"`. Prefer Astryx dialogs/sheets, otherwise native `<dialog>`.
- Announce important polling changes (proposal invalidation, unanimous consent) in `aria-live="polite"` regions.
- Target WCAG AA text contrast (4.5:1) when selecting token colors.
- Use `disabled` on unavailable buttons (e.g. closed event) and explain why nearby.
