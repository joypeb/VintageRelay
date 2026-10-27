'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { LinkProvider } from '@astryxdesign/core/Link';
import { Theme } from '@astryxdesign/core/theme';

import { defaultThemeSlug, themes } from '@/astryx-themes';

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <Theme theme={themes[defaultThemeSlug]}>
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  );
}
