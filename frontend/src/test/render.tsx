import type { ReactElement, ReactNode } from 'react';

import { Theme } from '@astryxdesign/core/theme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

import { defaultThemeSlug, themes } from '@/astryx-themes';

type WrapperProps = {
  children: ReactNode;
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: WrapperProps) {
    return (
      <Theme theme={themes[defaultThemeSlug]}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </Theme>
    );
  };
}

/** Renders `ui` with a fresh QueryClient and the Astryx theme for one test. */
export function renderWithClient(ui: ReactElement) {
  return render(ui, { wrapper: createWrapper(createTestQueryClient()) });
}
