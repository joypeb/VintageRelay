import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JoinEventScreen } from '@/components/event/JoinEventScreen';
import { queryKeys } from '@/lib/api/query-keys';
import * as session from '@/lib/session';
import { renderWithClient } from '@/test/render';
import type { EventSession } from '@/types/event';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), replace: vi.fn(), push: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));

const preview = { eventId: 'e1', name: 'Mangwon Swap', status: 'active' };
const joined: EventSession = {
  event: {
    id: 'e1',
    name: 'Mangwon Swap',
    status: 'active',
    entryCode: 'K7P3QX',
    entryUrl: 'http://localhost:3000/join?code=K7P3QX',
    organizerParticipantId: 'p1',
    createdAt: '2026-10-28T00:00:00Z',
    closedAt: null,
    me: { participantId: 'p2', displayName: 'Joon', isOrganizer: false },
    stats: null,
  },
  participantToken: 'SECRET-TOKEN',
};

function routeRequests(joinResult: Promise<unknown> = Promise.resolve(joined)) {
  mocks.apiFetch.mockImplementation((_eventId: string | null, path: string) => {
    if (path === '/entry-codes/K7P3QX') return Promise.resolve(preview);
    if (path === '/events/e1/participants') return joinResult;
    throw new Error(`Unexpected path: ${path}`);
  });
}

function joinCalls() {
  return mocks.apiFetch.mock.calls.filter((call) => call[1] === '/events/e1/participants');
}

describe('US1 join from link', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.apiFetch.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('automatically looks up the prefilled code and focuses the name after loading', async () => {
    let resolveLookup!: (value: typeof preview) => void;
    mocks.apiFetch.mockImplementation((_eventId: string | null, path: string) => {
      if (path === '/entry-codes/K7P3QX')
        return new Promise((resolve) => {
          resolveLookup = resolve;
        });
      throw new Error(`Unexpected path: ${path}`);
    });
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    expect(screen.getByRole('textbox', { name: 'Entry code' })).toHaveValue('K7P3QX');
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(1));
    expect(mocks.apiFetch.mock.calls[0]?.[1]).toBe('/entry-codes/K7P3QX');
    const find = screen.getByRole('button', { name: /find event/i });
    expect(
      find.hasAttribute('disabled') ||
        find.getAttribute('aria-disabled') === 'true' ||
        find.getAttribute('aria-busy') === 'true',
    ).toBe(true);
    await act(async () => resolveLookup(preview));
    expect(await screen.findByRole('heading', { name: 'Join event' })).toBeVisible();
    expect(screen.getByText('Mangwon Swap')).toBeVisible();
    expect(screen.getByText('Active', { exact: true })).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'My display name' })).toHaveFocus(),
    );
    expect(screen.getByRole('button', { name: 'Join' })).toBeVisible();
  });

  it('submits once, stores the participant session, seeds the cache, and replaces the route', async () => {
    const user = userEvent.setup();
    let resolveJoin!: (value: EventSession) => void;
    routeRequests(
      new Promise((resolve) => {
        resolveJoin = resolve;
      }),
    );
    const { queryClient, container } = renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await user.type(await screen.findByRole('textbox', { name: 'My display name' }), ' Joon ');
    const button = screen.getByRole('button', { name: 'Join' });
    await user.click(button);
    await waitFor(() => expect(joinCalls()).toHaveLength(1));
    const [eventId, path, init] = joinCalls()[0] ?? [];
    expect(eventId).toBeNull();
    expect(path).toBe('/events/e1/participants');
    expect(JSON.parse(init.body)).toEqual({ entryCode: 'K7P3QX', displayName: 'Joon' });
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByRole('textbox', { name: 'Entry code' })).toHaveAttribute('readonly');
    await user.click(button);
    expect(joinCalls()).toHaveLength(1);
    await act(async () => resolveJoin(joined));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledOnce());
    expect(session.getEventSession('e1')).toEqual({
      participantToken: 'SECRET-TOKEN',
      participantId: 'p2',
    });
    expect(queryClient.getQueryData(queryKeys.event('e1'))).toEqual(joined.event);
    expect(mocks.replace).toHaveBeenCalledWith('/events/e1');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(container).not.toHaveTextContent('SECRET-TOKEN');
  });

  it('submits on Enter in the display name field', async () => {
    const user = userEvent.setup();
    routeRequests(new Promise(() => {}));
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await user.type(await screen.findByRole('textbox', { name: 'My display name' }), 'Joon{Enter}');
    await waitFor(() => expect(joinCalls()).toHaveLength(1));
  });

  it('prevents joining when storage is unavailable', async () => {
    const user = userEvent.setup();
    routeRequests();
    vi.spyOn(session, 'isStorageAvailable').mockReturnValue(false);
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await user.type(await screen.findByRole('textbox', { name: 'My display name' }), 'Joon');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This browser can't save your event access. Turn off private browsing or try another browser.",
    );
    expect(joinCalls()).toHaveLength(0);
  });

  it('explains a session save failure without navigating', async () => {
    const user = userEvent.setup();
    routeRequests();
    vi.spyOn(session, 'saveEventSession').mockImplementation(() => {
      throw new Error('storage full');
    });
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await user.type(await screen.findByRole('textbox', { name: 'My display name' }), 'Joon');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(
      await screen.findByText(
        "You joined, but this browser couldn't keep your event access. Free up browser storage or open a regular (non-private) window, then join again with a different display name.",
      ),
    ).toBeVisible();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each(['', 'a'.repeat(31)])('rejects an invalid display name without joining', async (name) => {
    const user = userEvent.setup();
    routeRequests();
    const { container } = renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    const input = await screen.findByRole('textbox', { name: 'My display name' });
    if (name) await user.type(input, name);
    await user.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() =>
      expect(input).toHaveAccessibleDescription('Enter a display name of 1–30 characters.'),
    );
    expect(within(container).getByText('Enter a display name of 1–30 characters.')).toBeVisible();
    expect(joinCalls()).toHaveLength(0);
  });
});
