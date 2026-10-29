import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventHomeScreen } from '@/components/event/EventHomeScreen';
import { ApiError } from '@/lib/api/api-error';
import { saveEventSession } from '@/lib/session';
import { renderWithClient } from '@/test/render';
import type { Event } from '@/types/event';

const useEventQuery = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/events', () => ({ useEventQuery }));

const token = 'secret-token-xyz';
const event: Event = {
  id: 'e1',
  name: 'Mangwon Flea Market Swap Corner',
  status: 'active',
  entryCode: 'K7P3QX',
  entryUrl: 'http://localhost:3000/join?code=K7P3QX',
  organizerParticipantId: 'p-org',
  createdAt: '2026-10-28T00:00:00Z',
  closedAt: null,
  me: { participantId: 'p-org', displayName: 'Mina', isOrganizer: true },
  stats: { participantCount: 1, availableClothingCount: 0, confirmedExchangeCount: 0 },
};

function setQuery(data: Event | undefined, isPending = false) {
  useEventQuery.mockReturnValue({
    data,
    error: null,
    isPending,
    isFetching: isPending,
    refetch: vi.fn(),
  });
}

describe('US1 home', () => {
  beforeEach(() => {
    localStorage.clear();
    useEventQuery.mockReset();
    saveEventSession('e1', { participantToken: token, participantId: 'p-org' });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows the active event and organizer actions without exposing the token', async () => {
    setQuery(event);
    const { container } = renderWithClient(<EventHomeScreen eventId="e1" />);

    expect(await screen.findByRole('heading', { name: event.name })).toBeVisible();
    expect(screen.getByText('Active', { exact: true })).toBeVisible();
    expect(screen.getByText('You: Mina (Organizer)', { exact: true })).toBeVisible();
    expect(screen.getByRole('link', { name: /Manage event/ })).toHaveAttribute(
      'href',
      '/events/e1/manage',
    );
    expect(screen.getByText('View QR, entry code, and event counts')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Register my clothes' })).toHaveAttribute(
      'href',
      '/events/e1/my-items/new',
    );
    expect(useEventQuery).toHaveBeenCalledWith('e1', { enabled: true });
    expect(container).not.toHaveTextContent(token);
  });

  it('shows a regular participant without organizer actions or counts', async () => {
    setQuery({
      ...event,
      me: { participantId: 'p-joon', displayName: 'Joon', isOrganizer: false },
      stats: null,
    });
    const { container } = renderWithClient(<EventHomeScreen eventId="e1" />);

    expect(await screen.findByText('You: Joon', { exact: true })).toBeVisible();
    expect(screen.queryByText(/\(Organizer\)/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Manage event/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Participants')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(token);
  });

  it('shows a busy loading state without an event name', async () => {
    setQuery(undefined, true);
    const { container } = renderWithClient(<EventHomeScreen eventId="e1" />);

    expect(
      await screen.findByText((_, element) => element?.getAttribute('aria-busy') === 'true'),
    ).toBeInTheDocument();
    expect(screen.queryByText(event.name)).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(token);
  });
});

describe('US3 closed', () => {
  beforeEach(() => {
    localStorage.clear();
    useEventQuery.mockReset();
    saveEventSession('e1', { participantToken: token, participantId: 'p-org' });
  });
  afterEach(() => localStorage.clear());

  it('shows the closed state and hides clothing registration', async () => {
    setQuery({ ...event, status: 'closed', closedAt: '2026-10-27T09:00:00Z' });
    renderWithClient(<EventHomeScreen eventId="e1" />);
    expect(await screen.findByText('Closed', { exact: true })).toBeVisible();
    expect(screen.queryByText('Active', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Register my clothes' })).not.toBeInTheDocument();
  });
});

describe('US4 states', () => {
  beforeEach(() => {
    localStorage.clear();
    useEventQuery.mockReset();
  });
  afterEach(() => localStorage.clear());

  function setState(error: ApiError | null, data?: Event) {
    const refetch = vi.fn();
    useEventQuery.mockReturnValue({ data, error, isPending: false, isFetching: false, refetch });
    return refetch;
  }

  function expectNoAccessGuidance() {
    expect(screen.getByText("You haven't joined this event on this device.")).toBeVisible();
    expect(screen.getByRole('link', { name: 'Join with entry code' })).toHaveAttribute(
      'href',
      '/join',
    );
    expect(screen.getByRole('link', { name: 'Go to start' })).toHaveAttribute('href', '/');
  }

  it('shows guidance and disables the query without a session', () => {
    setState(null);
    renderWithClient(<EventHomeScreen eventId="e1" />);
    expect(useEventQuery).toHaveBeenCalledWith('e1', { enabled: false });
    expectNoAccessGuidance();
  });

  it('shows access guidance when the session is rejected', () => {
    saveEventSession('e1', { participantToken: token, participantId: 'p-org' });
    setState(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    renderWithClient(<EventHomeScreen eventId="e1" />);
    expectNoAccessGuidance();
  });

  it('shows guidance when the event is not found', () => {
    saveEventSession('e1', { participantToken: token, participantId: 'p-org' });
    setState(new ApiError(404, 'NOT_FOUND', 'x'));
    renderWithClient(<EventHomeScreen eventId="e1" />);
    expect(screen.getByText('This event could not be found.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to start' })).toHaveAttribute('href', '/');
  });

  it('shows the server error and retries on request', async () => {
    saveEventSession('e1', { participantToken: token, participantId: 'p-org' });
    const refetch = setState(new ApiError(500, 'INTERNAL_ERROR', 'Server message.'));
    const user = userEvent.setup();
    renderWithClient(<EventHomeScreen eventId="e1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Server message.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows a retryable error for a malformed result', () => {
    saveEventSession('e1', { participantToken: token, participantId: 'p-org' });
    setState(new ApiError(200, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.'));
    renderWithClient(<EventHomeScreen eventId="e1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('keeps previous event data visible when a background request fails', () => {
    saveEventSession('e1', { participantToken: token, participantId: 'p-org' });
    setState(new ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.'), event);
    renderWithClient(<EventHomeScreen eventId="e1" />);
    expect(screen.getByRole('heading', { name: event.name })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
