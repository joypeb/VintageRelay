import type { ReactElement } from 'react';

import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import JoinPage from '@/app/join/page';
import { renderWithClient } from '@/test/render';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), replace: vi.fn(), push: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));

const renderPage = JoinPage as unknown as (props: {
  searchParams: Promise<{ code?: string | string[] }>;
}) => Promise<ReactElement>;

describe('join page', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.apiFetch.mockReset();
    mocks.apiFetch.mockImplementation((_eventId: string | null, path: string) => {
      if (path === '/entry-codes/K7P3QX')
        return Promise.resolve({ eventId: 'e1', name: 'Mangwon Swap', status: 'active' });
      throw new Error(`Unexpected path: ${path}`);
    });
  });

  it('trims the link code and automatically looks it up', async () => {
    renderWithClient(await renderPage({ searchParams: Promise.resolve({ code: ' K7P3QX ' }) }));
    expect(screen.getByRole('textbox', { name: 'Entry code' })).toHaveValue('K7P3QX');
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        null,
        '/entry-codes/K7P3QX',
        {},
        expect.anything(),
      ),
    );
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('starts with an empty code and does not look up an event', async () => {
    renderWithClient(await renderPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('textbox', { name: 'Entry code' })).toHaveValue('');
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
