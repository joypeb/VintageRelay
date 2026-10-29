import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventClosedBanner } from '@/components/event/EventClosedBanner';
import { saveEventSession } from '@/lib/session';
import { renderWithClient } from '@/test/render';
import type { Event } from '@/types/event';

const { useEventQuery, formatDateTime } = vi.hoisted(() => ({
  useEventQuery: vi.fn(),
  formatDateTime: vi.fn(() => 'Oct 27, 2026, 6:00 PM'),
}));
vi.mock('@/lib/api/events', () => ({ useEventQuery }));
vi.mock('@/lib/utils/date', () => ({ formatDateTime }));

const event: Event = {
  id: 'e1',
  name: 'Mangwon Flea Market Swap Corner',
  status: 'active',
  entryCode: 'K7P3QX',
  entryUrl: 'http://localhost:3000/join?code=K7P3QX',
  organizerParticipantId: 'p-org',
  createdAt: '2026-10-27T00:00:00Z',
  closedAt: null,
  me: { participantId: 'p-org', displayName: 'Mina', isOrganizer: true },
  stats: { participantCount: 1, availableClothingCount: 0, confirmedExchangeCount: 0 },
};

function setQuery(data: Event | undefined, isPending = false, error: Error | null = null) {
  useEventQuery.mockReturnValue({
    data,
    error,
    isPending,
    isFetching: isPending,
    refetch: vi.fn(),
  });
}

describe('US3 closed banner', () => {
  beforeEach(() => {
    localStorage.clear();
    useEventQuery.mockReset();
    formatDateTime.mockClear();
    saveEventSession('e1', { participantToken: 'secret-token-xyz', participantId: 'p-org' });
  });
  afterEach(() => localStorage.clear());

  it('shows the closure time for a closed event', async () => {
    setQuery({ ...event, status: 'closed', closedAt: '2026-10-27T09:00:00Z' });
    renderWithClient(<EventClosedBanner eventId="e1" />);
    expect(await screen.findByText('This event has ended.')).toBeVisible();
    expect(screen.getByText('Closed Oct 27, 2026, 6:00 PM')).toBeVisible();
    expect(formatDateTime).toHaveBeenCalledWith('2026-10-27T09:00:00Z');
  });

  it.each([
    ['active', event, false, null],
    ['pending', undefined, true, null],
    ['error', undefined, false, new Error('Failed to load')],
  ])('renders nothing for an %s event', async (_state, data, isPending, error) => {
    setQuery(data, isPending, error);
    const { container } = renderWithClient(<EventClosedBanner eventId="e1" />);
    await waitFor(() => expect(useEventQuery).toHaveBeenCalledWith('e1', { enabled: true }));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing and disables the query without a session', async () => {
    localStorage.clear();
    setQuery(undefined, true);
    const { container } = renderWithClient(<EventClosedBanner eventId="e1" />);
    await waitFor(() => expect(useEventQuery).toHaveBeenCalledWith('e1', { enabled: false }));
    expect(container).toBeEmptyDOMElement();
  });
});
