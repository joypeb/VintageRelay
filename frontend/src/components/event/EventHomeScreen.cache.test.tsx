import { QueryClient } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventHomeScreen } from '@/components/event/EventHomeScreen';
import { queryKeys } from '@/lib/api/query-keys';
import { saveEventSession } from '@/lib/session';
import { renderWithClient } from '@/test/render';
import type { Event } from '@/types/event';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiFetch }));
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

const activeEvent: Event = {
  id: 'e1',
  name: 'Mangwon Flea Market Swap Corner',
  status: 'active',
  entryCode: 'K7P3QX',
  entryUrl: 'http://localhost:3000/join?code=K7P3QX',
  organizerParticipantId: 'p-org',
  createdAt: '2026-10-28T00:00:00Z',
  closedAt: null,
  me: { participantId: 'p-org', displayName: 'Mina', isOrganizer: true },
  stats: { participantCount: 3, availableClothingCount: 0, confirmedExchangeCount: 2 },
};
const closedEvent: Event = { ...activeEvent, status: 'closed', closedAt: '2026-10-29T09:00:00Z' };

describe('shared event cache regression guard', () => {
  beforeEach(() => {
    localStorage.clear();
    apiFetch.mockReset();
    saveEventSession('e1', { participantToken: 'secret-token-xyz', participantId: 'p-org' });
  });
  afterEach(() => localStorage.clear());

  it('renders a cached participant event before the GET resolves (regression guard)', () => {
    saveEventSession('e1', { participantToken: 't', participantId: 'p2' });
    apiFetch.mockImplementation(() => new Promise(() => {}));
    const participantEvent: Event = {
      ...activeEvent,
      me: { participantId: 'p2', displayName: 'Joon', isOrganizer: false },
      stats: null,
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.event('e1'), participantEvent);
    renderWithClient(<EventHomeScreen eventId="e1" />, { queryClient });
    expect(screen.getByText(participantEvent.name)).toBeVisible();
    expect(screen.getByText('Active', { exact: true })).toBeVisible();
    expect(screen.queryByRole('link', { name: /manage event/i })).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalled();
  });

  it('shows closure and hides registration as soon as the shared cache changes', async () => {
    let reads = 0;
    apiFetch.mockImplementation((_id: string, _path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(closedEvent);
      return ++reads === 1 ? Promise.resolve(activeEvent) : new Promise(() => {});
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    renderWithClient(<EventHomeScreen eventId="e1" />, { queryClient });
    expect(await screen.findByText('Active', { exact: true })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Register my clothes' })).toBeVisible();
    act(() => {
      queryClient.setQueryData(queryKeys.event('e1'), closedEvent);
      void queryClient.invalidateQueries({ queryKey: queryKeys.event('e1'), exact: true });
    });
    expect(await screen.findByText('Closed', { exact: true })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Register my clothes' })).not.toBeInTheDocument();
    expect(reads).toBe(2);
  });
});
