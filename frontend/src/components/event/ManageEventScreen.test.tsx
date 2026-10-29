import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageEventScreen } from '@/components/event/ManageEventScreen';
import { saveEventSession } from '@/lib/session';
import { renderWithClient } from '@/test/render';
import type { Event } from '@/types/event';

const { useEventQuery, apiFetch, qr } = vi.hoisted(() => ({
  useEventQuery: vi.fn(),
  apiFetch: vi.fn(),
  qr: vi.fn<(props: { value: string }) => null>(() => null),
}));
vi.mock('@/lib/api/events', () => ({ useEventQuery }));
vi.mock('@/lib/api/client', () => ({ apiFetch }));
vi.mock('qrcode.react', () => ({ QRCodeSVG: qr }));

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
  stats: { participantCount: 3, availableClothingCount: 0, confirmedExchangeCount: 2 },
};

function setQuery(data: Event, refetch = vi.fn(), isFetching = false) {
  useEventQuery.mockReturnValue({ data, error: null, isPending: false, isFetching, refetch });
  return refetch;
}

describe('US2 manage', () => {
  beforeEach(() => {
    localStorage.clear();
    useEventQuery.mockReset();
    apiFetch.mockReset();
    qr.mockClear();
    saveEventSession('e1', { participantToken: token, participantId: 'p-org' });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows the share card and exact counts for the organizer without exposing the token', async () => {
    setQuery(event);
    const { container } = renderWithClient(<ManageEventScreen eventId="e1" />);
    expect(await screen.findByRole('heading', { name: 'Manage event' })).toBeVisible();
    expect(screen.getByText(event.name, { exact: true })).toBeVisible();
    expect(screen.getByRole('img', { name: `QR code to join ${event.name}` })).toBeVisible();
    expect(qr.mock.calls.at(-1)?.[0].value).toBe(event.entryUrl);
    expect(screen.getByText(event.entryCode, { exact: true })).toBeVisible();
    for (const [label, value] of [
      ['Participants', '3'],
      ['Available garments', '0'],
      ['Confirmed exchanges', '2'],
    ] as const) {
      const row = screen.getByText(label, { exact: true }).parentElement;
      expect(row).not.toBeNull();
      expect(within(row as HTMLElement).getByText(value, { exact: true })).toBeVisible();
    }
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
      'href',
      '/events/e1',
    );
    expect(useEventQuery).toHaveBeenCalledWith('e1', { enabled: true });
    expect(container).not.toHaveTextContent(token);
  });

  it('refreshes once and prevents another refresh while fetching', async () => {
    const user = userEvent.setup();
    const refetch = setQuery(event);
    const { rerender, container } = renderWithClient(<ManageEventScreen eventId="e1" />);
    await user.click(await screen.findByRole('button', { name: 'Refresh' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    setQuery(event, refetch, true);
    rerender(<ManageEventScreen eventId="e1" />);
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    expect(refresh.getAttribute('aria-busy') === 'true' || refresh.hasAttribute('disabled')).toBe(
      true,
    );
    await user.click(refresh);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(container).not.toHaveTextContent(token);
  });

  it('announces that closing is coming soon without making a request', async () => {
    const user = userEvent.setup();
    const refetch = setQuery(event);
    const { container } = renderWithClient(<ManageEventScreen eventId="e1" />);
    const closeButton = await screen.findByRole('button', { name: 'Close event' });
    expect(closeButton).toBeVisible();
    await user.click(closeButton);
    const message = screen.getByText('Closing the event is coming soon.');
    expect(message.closest('[role="status"]')).not.toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
    expect(container).not.toHaveTextContent(token);
  });

  it('restricts the manage screen for a regular participant', async () => {
    saveEventSession('e1', { participantToken: token, participantId: 'p-joon' });
    setQuery({
      ...event,
      me: { participantId: 'p-joon', displayName: 'Joon', isOrganizer: false },
      stats: null,
    });
    const { container } = renderWithClient(<ManageEventScreen eventId="e1" />);
    expect(await screen.findByText('Only the organizer can manage this event.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
      'href',
      '/events/e1',
    );
    expect(screen.queryByText('Participants', { exact: true })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: `QR code to join ${event.name}` }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(event.entryCode, { exact: true })).not.toBeInTheDocument();
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

  it('keeps organizer counts visible and hides the close action', async () => {
    setQuery({ ...event, status: 'closed', closedAt: '2026-10-27T09:00:00Z' });
    renderWithClient(<ManageEventScreen eventId="e1" />);
    expect(await screen.findByRole('heading', { name: 'Manage event' })).toBeVisible();
    for (const [label, value] of [
      ['Participants', '3'],
      ['Available garments', '0'],
      ['Confirmed exchanges', '2'],
    ] as const) {
      const row = screen.getByText(label, { exact: true }).parentElement;
      expect(row).not.toBeNull();
      expect(within(row as HTMLElement).getByText(value, { exact: true })).toBeVisible();
    }
    expect(screen.queryByRole('button', { name: 'Close event' })).not.toBeInTheDocument();
  });
});
