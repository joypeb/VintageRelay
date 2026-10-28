'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { LinkProvider } from '@astryxdesign/core/Link';
import { Theme } from '@astryxdesign/core/theme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { defaultThemeSlug, themes } from '@/astryx-themes';

type ProvidersProps = {
  children: ReactNode;
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true },
      mutations: { retry: 0 },
    },
  });
}

export function Providers({ children }: ProvidersProps) {
  // One client per mount so the cache is not shared across requests or remounts.
  const [queryClient] = useState(createQueryClient);

  return (
    <Theme theme={themes[defaultThemeSlug]}>
      <QueryClientProvider client={queryClient}>
        <LinkProvider component={Link}>{children}</LinkProvider>
      </QueryClientProvider>
    </Theme>
  );
}
