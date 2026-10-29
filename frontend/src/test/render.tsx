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

type RenderWithClientOptions = {
  /** Client shared with other renders or seeded before rendering; a fresh test client by default. */
  queryClient?: QueryClient;
};

/**
 * Renders `ui` with a QueryClient and the Astryx theme for one test.
 * Pass `options.queryClient` to share one client across renders; otherwise a
 * fresh test client is created. The client in use is returned as `queryClient`.
 * `container` is the theme root element, so it is empty when `ui` renders nothing.
 */
export function renderWithClient(ui: ReactElement, options: RenderWithClientOptions = {}) {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const result = render(ui, { wrapper: createWrapper(queryClient) });
  return {
    ...result,
    queryClient,
    container: (result.container.firstElementChild ?? result.container) as HTMLElement,
  };
}
