import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { YourEventsList } from '@/components/event/YourEventsList';
import { ApiError } from '@/lib/api/api-error';
import { getEvent } from '@/lib/api/events';
import type * as events from '@/lib/api/events';
import { getEventSession } from '@/lib/session';
import { renderWithClient } from '@/test/render';
import type { Event } from '@/types/event';

vi.mock('@/lib/api/events', async (importOriginal) => ({
  ...(await importOriginal<typeof events>()),
  getEvent: vi.fn(),
}));

function saveSession(eventId: string, savedAt: number) {
  localStorage.setItem(
    `vr:event:${eventId}`,
    JSON.stringify({ participantToken: 'token', participantId: 'participant', savedAt }),
  );
}

function event(id: string, name: string, status: Event['status']): Event {
  return {
    id,
    name,
    status,
    entryCode: 'ABC123',
    entryUrl: 'https://example.com/join',
    organizerParticipantId: 'organizer',
    createdAt: '2026-11-02T00:00:00Z',
    closedAt: status === 'closed' ? '2026-11-02T01:00:00Z' : null,
    me: { participantId: 'participant', displayName: 'Pat', isOrganizer: false },
    stats: null,
  };
}

describe('YourEventsList', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getEvent).mockReset();
  });

  it('shows a loading indicator in the event list while sessions are loading', () => {
    saveSession('pending', 1);
    vi.mocked(getEvent).mockReturnValue(new Promise(() => {}));

    renderWithClient(<YourEventsList />);

    const indicator = screen.getByRole('status');
    expect(indicator).toBeInTheDocument();
    expect(screen.getByRole('list')).toContainElement(indicator);
  });

  it('shows event names and states in newest-first order with links to their homes', async () => {
    saveSession('older', 1);
    saveSession('newer', 2);
    vi.mocked(getEvent).mockImplementation(async (id) =>
      id === 'older' ? event(id, 'Older event', 'closed') : event(id, 'Newer event', 'active'),
    );

    renderWithClient(<YourEventsList />);

    const newer = await screen.findByRole('link', { name: /newer event/i });
    const older = await screen.findByRole('link', { name: /older event/i });
    expect(newer).toHaveAttribute('href', '/events/newer');
    expect(older).toHaveAttribute('href', '/events/older');
    expect(newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('shows the Your events heading with visible sessions', async () => {
    saveSession('valid', 1);
    vi.mocked(getEvent).mockResolvedValue(event('valid', 'Valid event', 'active'));

    renderWithClient(<YourEventsList />);

    await screen.findByRole('link', { name: /valid event/i });
    expect(screen.getByRole('heading', { name: /your events/i })).toBeInTheDocument();
  });

  it('renders nothing when all saved sessions are inaccessible', async () => {
    saveSession('unauthenticated', 2);
    saveSession('not-found', 1);
    vi.mocked(getEvent).mockImplementation(async (id) => {
      if (id === 'unauthenticated') throw new ApiError(401, 'UNAUTHENTICATED', 'Unavailable');
      throw new ApiError(404, 'NOT_FOUND', 'Unavailable');
    });

    const { container } = renderWithClient(<YourEventsList />);

    await waitFor(() => {
      expect(localStorage.getItem('vr:event:unauthenticated')).toBeNull();
      expect(localStorage.getItem('vr:event:not-found')).toBeNull();
    });
    expect(screen.queryByRole('heading', { name: /your events/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('removes unreadable sessions while retaining and showing valid sessions', async () => {
    saveSession('valid', 1);
    localStorage.setItem('vr:event:unreadable', JSON.stringify({ participantToken: '' }));
    vi.mocked(getEvent).mockResolvedValue(event('valid', 'Valid event', 'active'));

    renderWithClient(<YourEventsList />);

    expect(await screen.findByRole('link', { name: /valid event/i })).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('vr:event:unreadable')).toBeNull());
    expect(getEventSession('valid')).not.toBeNull();
    expect(getEvent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['UNAUTHENTICATED', 401],
    ['NOT_FOUND', 404],
  ])('removes a session when its event returns %s', async (code, status) => {
    saveSession('invalid', 2);
    saveSession('valid', 1);
    vi.mocked(getEvent).mockImplementation(async (id) => {
      if (id === 'invalid') throw new ApiError(status, code, 'Unavailable');
      return event(id, 'Valid event', 'active');
    });

    renderWithClient(<YourEventsList />);

    await screen.findByText('Valid event');
    await waitFor(() => expect(getEventSession('invalid')).toBeNull());
    expect(getEventSession('valid')).not.toBeNull();
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('keeps a transiently failing session unknown and retries it on request', async () => {
    saveSession('temporary', 1);
    vi.mocked(getEvent)
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Network unavailable'))
      .mockResolvedValue(event('temporary', 'Recovered event', 'active'));
    const user = userEvent.setup();

    renderWithClient(<YourEventsList />);

    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(screen.getByText(/unknown/i)).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(screen.queryByText('Closed')).not.toBeInTheDocument();
    expect(getEventSession('temporary')).not.toBeNull();

    await user.click(retry);
    expect(await screen.findByText('Recovered event')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(getEvent).toHaveBeenCalledTimes(2);
  });
});
