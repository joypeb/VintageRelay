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

describe('US2 typed code', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.apiFetch.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('starts with an empty code and no lookup or display name', () => {
    renderWithClient(<JoinEventScreen initialCode={null} />);
    expect(screen.getByRole('textbox', { name: 'Entry code' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Find event' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'My display name' })).not.toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('validates a blank code and clears the error when edited', async (code) => {
    const user = userEvent.setup();
    const { container } = renderWithClient(<JoinEventScreen initialCode={null} />);
    const input = screen.getByRole('textbox', { name: 'Entry code' });
    if (code) await user.type(input, code);
    await user.click(screen.getByRole('button', { name: 'Find event' }));
    await waitFor(() => expect(input).toHaveAccessibleDescription('Enter the entry code.'));
    expect(within(container).getByText('Enter the entry code.')).toBeVisible();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    await user.type(input, 'A');
    expect(input).not.toHaveAccessibleDescription('Enter the entry code.');
    expect(within(container).queryByText('Enter the entry code.')).not.toBeInTheDocument();
  });

  it.each(['click', 'Enter'])('looks up the trimmed code on %s', async (method) => {
    const user = userEvent.setup();
    mocks.apiFetch.mockResolvedValue(preview);
    renderWithClient(<JoinEventScreen initialCode={null} />);
    await user.type(screen.getByRole('textbox', { name: 'Entry code' }), '  k7p3qx ');
    if (method === 'click') await user.click(screen.getByRole('button', { name: 'Find event' }));
    else await user.keyboard('{Enter}');
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(1));
    expect(mocks.apiFetch.mock.calls[0]?.[1]).toBe('/entry-codes/k7p3qx');
    expect(await screen.findByText('Mangwon Swap')).toBeVisible();
    expect(screen.getByText('Active', { exact: true })).toBeVisible();
  });

  it('does not start a second lookup when Find event is double-clicked', async () => {
    const user = userEvent.setup();
    mocks.apiFetch.mockImplementation(() => new Promise(() => {}));
    renderWithClient(<JoinEventScreen initialCode={null} />);
    await user.type(screen.getByRole('textbox', { name: 'Entry code' }), 'AAA');
    await user.dblClick(screen.getByRole('button', { name: 'Find event' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(1));
    expect(mocks.apiFetch.mock.calls[0]?.[1]).toBe('/entry-codes/AAA');
  });

  it('clears the preview when the entry code is edited', async () => {
    const user = userEvent.setup();
    mocks.apiFetch.mockResolvedValue(preview);
    renderWithClient(<JoinEventScreen initialCode={null} />);
    const input = screen.getByRole('textbox', { name: 'Entry code' });
    await user.type(input, 'AAA');
    await user.click(screen.getByRole('button', { name: 'Find event' }));
    expect(await screen.findByText('Mangwon Swap')).toBeVisible();
    await user.type(input, 'B');
    expect(screen.queryByText('Mangwon Swap')).not.toBeInTheDocument();
    expect(screen.queryByText('Active', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'My display name' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find event' })).toBeVisible();
  });

  it('discards stale results and serializes lookups after editing a pending code', async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: typeof preview) => void;
    let resolveSecond!: (value: typeof preview) => void;
    let pending = 0;
    let maxPending = 0;
    mocks.apiFetch.mockImplementation((_eventId: string | null, path: string) => {
      pending += 1;
      maxPending = Math.max(maxPending, pending);
      return new Promise<typeof preview>((resolve) => {
        const finish = (value: typeof preview) => {
          pending -= 1;
          resolve(value);
        };
        if (path === '/entry-codes/AAA') resolveFirst = finish;
        else if (path === '/entry-codes/BBB') resolveSecond = finish;
        else throw new Error(`Unexpected path: ${path}`);
      });
    });
    renderWithClient(<JoinEventScreen initialCode={null} />);
    const input = screen.getByRole('textbox', { name: 'Entry code' });
    await user.type(input, 'AAA');
    await user.click(screen.getByRole('button', { name: 'Find event' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(1));
    await user.clear(input);
    await user.type(input, 'BBB');
    const find = screen.getByRole('button', { name: 'Find event' });
    expect(
      find.hasAttribute('disabled') ||
        find.getAttribute('aria-disabled') === 'true' ||
        find.getAttribute('aria-busy') === 'true',
    ).toBe(true);
    await user.click(find);
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    await act(async () => resolveFirst({ ...preview, name: 'AAA event' }));
    expect(screen.queryByText('AAA event')).not.toBeInTheDocument();
    await waitFor(() => expect(find).toBeEnabled());
    await user.click(find);
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(2));
    expect(mocks.apiFetch.mock.calls[1]?.[1]).toBe('/entry-codes/BBB');
    expect(maxPending).toBe(1);
    await act(async () => resolveSecond({ ...preview, name: 'BBB event' }));
    expect(await screen.findByText('BBB event')).toBeVisible();
  });

  it('retries the same code after a failed lookup', async () => {
    const user = userEvent.setup();
    mocks.apiFetch.mockRejectedValueOnce(new Error('lookup failed')).mockResolvedValueOnce(preview);
    renderWithClient(<JoinEventScreen initialCode={null} />);
    await user.type(screen.getByRole('textbox', { name: 'Entry code' }), 'AAA');
    const find = screen.getByRole('button', { name: 'Find event' });
    await user.click(find);
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(find).toBeEnabled());
    await user.click(find);
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(2));
    expect(mocks.apiFetch.mock.calls.map((call) => call[1])).toEqual([
      '/entry-codes/AAA',
      '/entry-codes/AAA',
    ]);
    expect(await screen.findByText('Mangwon Swap')).toBeVisible();
  });
});
