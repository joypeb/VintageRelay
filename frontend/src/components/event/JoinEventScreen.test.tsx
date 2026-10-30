import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JoinEventScreen } from '@/components/event/JoinEventScreen';
import { ApiError } from '@/lib/api/api-error';
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

describe('US3 failures', () => {
  const missing = "We couldn't find an event with this code. Check the code and try again.";
  const taken = 'This display name is already taken.';
  const generic = 'Something went wrong. Please try again.';
  const closed = 'This event has ended. You can no longer join.';
  const timeout =
    'The connection timed out. Please try again. If your display name is now taken, choose a different one.';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.apiFetch.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function handledRejection(error: ApiError) {
    const result = Promise.reject(error);
    void result.catch(() => {});
    return result;
  }

  async function submit(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByRole('textbox', { name: 'My display name' }), 'Joon');
    await user.click(screen.getByRole('button', { name: 'Join' }));
  }
  function form() {
    const element = screen.getByRole('heading', { name: 'Join event' }).closest('form');
    if (!element) throw new Error('Join form not found');
    return within(element);
  }
  function expectClosed() {
    expect(screen.getByText('Mangwon Swap')).toBeVisible();
    expect(screen.getByText('Closed', { exact: true })).toBeVisible();
    expect(form().getByText(closed)).toHaveAttribute('role', 'status');
    expect(screen.getByRole('link', { name: 'Go to start' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('textbox', { name: 'My display name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();
  }
  it('shows lookup not found on the retained code', async () => {
    mocks.apiFetch.mockRejectedValue(new ApiError(404, 'NOT_FOUND', missing));
    const { container } = renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    const code = screen.getByRole('textbox', { name: 'Entry code' });
    await waitFor(() => expect(code).toHaveAccessibleDescription(missing));
    expect(within(container).getByText(missing)).toBeVisible();
    expect(code).toHaveValue('K7P3QX');
    expect(screen.queryByRole('textbox', { name: 'My display name' })).not.toBeInTheDocument();
  });
  it.each([
    new ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.'),
    new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'),
  ])('shows lookup $code and retries with the retained code', async (error) => {
    const user = userEvent.setup();
    mocks.apiFetch.mockRejectedValueOnce(error).mockResolvedValueOnce(preview);
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    expect(await form().findByRole('alert')).toHaveTextContent(error.message);
    expect(screen.getByRole('textbox', { name: 'Entry code' })).toHaveValue('K7P3QX');
    await user.click(screen.getByRole('button', { name: 'Find event' }));
    expect(await screen.findByText('Mangwon Swap')).toBeVisible();
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
  });
  it('shows a closed preview without allowing a join', async () => {
    mocks.apiFetch.mockResolvedValue({ ...preview, status: 'closed' });
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await form().findByText(closed);
    expectClosed();
    expect(joinCalls()).toHaveLength(0);
  });
  it('keeps a taken name and allows another join attempt', async () => {
    const user = userEvent.setup();
    routeRequests(
      handledRejection(new ApiError(409, 'DISPLAY_NAME_TAKEN', taken, { field: 'displayName' })),
    );
    const { container } = renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await submit(user);
    const name = screen.getByRole('textbox', { name: 'My display name' });
    await waitFor(() => expect(name).toHaveAccessibleDescription(taken));
    expect(within(container).getByText(taken)).toBeVisible();
    expect(name).toHaveValue('Joon');
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(joinCalls()).toHaveLength(2));
  });
  it('focuses the closed message when the event closes during joining', async () => {
    const user = userEvent.setup();
    routeRequests(handledRejection(new ApiError(409, 'EVENT_CLOSED', closed)));
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await submit(user);
    const status = await form().findByText(closed);
    expectClosed();
    expect(status).toHaveFocus();
  });
  it('returns to code entry with a join not found error', async () => {
    const user = userEvent.setup();
    routeRequests(handledRejection(new ApiError(404, 'NOT_FOUND', 'Not here.')));
    const { container } = renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await submit(user);
    const code = screen.getByRole('textbox', { name: 'Entry code' });
    await waitFor(() => expect(code).toHaveAccessibleDescription('Not here.'));
    expect(within(container).getByText('Not here.')).toBeVisible();
    expect(screen.queryByText('Mangwon Swap')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find event' })).toBeVisible();
  });
  it('maps a join validation error to the name field', async () => {
    const user = userEvent.setup();
    routeRequests(
      handledRejection(
        new ApiError(422, 'VALIDATION_ERROR', 'Invalid', {
          fields: [{ field: 'displayName', reason: 'too_long' }],
        }),
      ),
    );
    const { container } = renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await submit(user);
    const message = 'Enter a display name of 1–30 characters.';
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'My display name' })).toHaveAccessibleDescription(
        message,
      ),
    );
    expect(within(container).getByText(message)).toBeVisible();
  });
  it('shows a generic form error for an unknown validation field', async () => {
    const user = userEvent.setup();
    routeRequests(
      handledRejection(
        new ApiError(422, 'VALIDATION_ERROR', 'Invalid', {
          fields: [{ field: 'unknown', reason: 'too_long' }],
        }),
      ),
    );
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await submit(user);
    expect(await form().findByRole('alert')).toHaveTextContent(generic);
  });
  it.each([
    ['timeout', new ApiError(0, 'NETWORK_ERROR', timeout), timeout],
    ['server error', new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'), 'Server says no.'],
    ['invalid success', null, generic],
  ])('retains inputs and retries after join %s', async (_label, error, message) => {
    const user = userEvent.setup();
    const invalid = {
      ...joined,
      event: { ...joined.event, me: { ...joined.event.me, participantId: 'p1' } },
    };
    mocks.apiFetch.mockImplementation((_eventId: string | null, path: string) => {
      if (path === '/entry-codes/K7P3QX') return Promise.resolve(preview);
      if (path === '/events/e1/participants')
        return error ? Promise.reject(error) : Promise.resolve(invalid);
      throw new Error(`Unexpected path: ${path}`);
    });
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await submit(user);
    expect(await form().findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('textbox', { name: 'Entry code' })).toHaveValue('K7P3QX');
    expect(screen.getByRole('textbox', { name: 'My display name' })).toHaveValue('Joon');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(joinCalls()).toHaveLength(2));
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it('clears the name field error when the name is edited', async () => {
    const user = userEvent.setup();
    routeRequests(handledRejection(new ApiError(409, 'DISPLAY_NAME_TAKEN', taken)));
    const { container } = renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await submit(user);
    const name = screen.getByRole('textbox', { name: 'My display name' });
    await waitFor(() => expect(name).toHaveAccessibleDescription(taken));
    await user.type(name, 'a');
    expect(name).not.toHaveAccessibleDescription(taken);
    expect(within(container).queryByText(taken)).not.toBeInTheDocument();
  });
  it('clears the form error when the name is edited', async () => {
    const user = userEvent.setup();
    routeRequests(handledRejection(new ApiError(500, 'INTERNAL_ERROR', 'Server says no.')));
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await submit(user);
    await form().findByRole('alert');
    await user.type(screen.getByRole('textbox', { name: 'My display name' }), 'a');
    expect(form().queryByRole('alert')).not.toBeInTheDocument();
  });
  it('clears a name error immediately on code edit and on the next preview', async () => {
    const user = userEvent.setup();
    mocks.apiFetch.mockImplementation((_eventId: string | null, path: string) =>
      path.startsWith('/entry-codes/')
        ? Promise.resolve(preview)
        : Promise.reject(new ApiError(409, 'DISPLAY_NAME_TAKEN', taken)),
    );
    const { container } = renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await submit(user);
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'My display name' })).toHaveAccessibleDescription(
        taken,
      ),
    );
    await user.type(screen.getByRole('textbox', { name: 'Entry code' }), 'A');
    expect(within(container).queryByText(taken)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Find event' }));
    const name = await screen.findByRole('textbox', { name: 'My display name' });
    expect(name).not.toHaveAccessibleDescription(taken);
    expect(within(container).queryByText(taken)).not.toBeInTheDocument();
  });
  it('clears a form error when the code is edited', async () => {
    const user = userEvent.setup();
    routeRequests(handledRejection(new ApiError(500, 'INTERNAL_ERROR', 'Server says no.')));
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await submit(user);
    await form().findByRole('alert');
    await user.type(screen.getByRole('textbox', { name: 'Entry code' }), 'A');
    expect(form().queryByRole('alert')).not.toBeInTheDocument();
  });
  it('returns to code entry when the code is edited after a join closes', async () => {
    const user = userEvent.setup();
    routeRequests(handledRejection(new ApiError(409, 'EVENT_CLOSED', closed)));
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await submit(user);
    await form().findByText(closed);
    await user.type(screen.getByRole('textbox', { name: 'Entry code' }), 'A');
    expect(screen.queryByText(closed)).not.toBeInTheDocument();
    expect(screen.queryByText('Closed', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Mangwon Swap')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find event' })).toBeVisible();
  });
  it.each(['success', 'lookup network', 'join 500', 'join exception', 'save failure'])(
    'does not log secrets during %s (regression guard)',
    async (scenario) => {
      const user = userEvent.setup();
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mocks.apiFetch.mockImplementation((_eventId: string | null, path: string) => {
        if (path === '/entry-codes/K7P3QX')
          return scenario === 'lookup network'
            ? Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'Network failure'))
            : Promise.resolve(preview);
        if (path === '/events/e1/participants') {
          if (scenario === 'join 500')
            return Promise.reject(new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'));
          if (scenario === 'join exception') return Promise.reject(new Error('boom'));
          return Promise.resolve(joined);
        }
        throw new Error(`Unexpected path: ${path}`);
      });
      if (scenario === 'save failure')
        vi.spyOn(session, 'saveEventSession').mockImplementation(() => {
          throw new Error('storage full');
        });
      renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
      if (scenario === 'lookup network') {
        await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(1));
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Find event' })).toBeEnabled(),
        );
      } else {
        await submit(user);
        await waitFor(() => expect(joinCalls()).toHaveLength(1));
        if (scenario === 'success')
          await waitFor(() => expect(mocks.replace).toHaveBeenCalledOnce());
        if (scenario === 'save failure') await form().findByRole('alert');
        if (scenario === 'join 500' || scenario === 'join exception')
          await waitFor(() => expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled());
      }
      const logged = [...errors.mock.calls, ...warnings.mock.calls]
        .flat()
        .map((arg: unknown) =>
          arg instanceof Error
            ? `${arg.message} ${arg.stack ?? ''} ${JSON.stringify(arg)}`
            : (JSON.stringify(arg) ?? String(arg)),
        )
        .join(' ');
      expect(logged).not.toContain('SECRET-TOKEN');
      expect(logged).not.toContain('K7P3QX');
    },
  );
});

describe('US4 already joined', () => {
  const notice = "You've already joined this event on this device.";
  const closedMessage = 'This event has ended. You can no longer join.';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.apiFetch.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each(['active', 'closed'])('shows existing access for an %s preview', async (status) => {
    session.saveEventSession('e1', { participantToken: 't', participantId: 'p1' });
    mocks.apiFetch.mockResolvedValue({ ...preview, status });
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);

    expect(await screen.findByText(notice)).toBeVisible();
    expect(screen.getByText('Mangwon Swap')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to event home' })).toHaveAttribute(
      'href',
      '/events/e1',
    );
    expect(screen.queryByText(closedMessage)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'My display name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();
    expect(joinCalls()).toHaveLength(0);
  });

  it('shows the active form when access belongs to another event', async () => {
    session.saveEventSession('e9', { participantToken: 't', participantId: 'p1' });
    mocks.apiFetch.mockResolvedValue(preview);
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);

    expect(await screen.findByRole('textbox', { name: 'My display name' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Join' })).toBeVisible();
    expect(screen.queryByText(notice)).not.toBeInTheDocument();
  });

  it('shows the active form when the stored session is invalid', async () => {
    localStorage.setItem('vr:event:e1', '{}');
    mocks.apiFetch.mockResolvedValue(preview);
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);

    expect(await screen.findByRole('textbox', { name: 'My display name' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Join' })).toBeVisible();
    expect(screen.queryByText(notice)).not.toBeInTheDocument();
  });

  async function submitAfterAccessAppears(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByRole('textbox', { name: 'My display name' }), 'Joon');
    const join = screen.getByRole('button', { name: 'Join' });
    session.saveEventSession('e1', { participantToken: 'other', participantId: 'p9' });
    await user.click(join);
  }

  it('rechecks access on submit without sending a join or replacing the session', async () => {
    const user = userEvent.setup();
    routeRequests(new Promise(() => {}));
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await submitAfterAccessAppears(user);

    expect(joinCalls()).toHaveLength(0);
    expect(await screen.findByText(notice)).toBeVisible();
    expect(session.getEventSession('e1')?.participantToken).toBe('other');
  });

  it('clears the already-joined override when looking up another event', async () => {
    const user = userEvent.setup();
    mocks.apiFetch.mockImplementation((_eventId: string | null, path: string) => {
      if (path === '/entry-codes/K7P3QX') return Promise.resolve(preview);
      if (path === '/entry-codes/BBB')
        return Promise.resolve({ eventId: 'e2', name: 'Other Swap', status: 'active' });
      if (path === '/events/e1/participants') return new Promise(() => {});
      throw new Error(`Unexpected path: ${path}`);
    });
    renderWithClient(<JoinEventScreen initialCode="K7P3QX" />);
    await submitAfterAccessAppears(user);
    expect(await screen.findByText(notice)).toBeVisible();
    expect(joinCalls()).toHaveLength(0);

    const code = screen.getByRole('textbox', { name: 'Entry code' });
    await user.clear(code);
    await user.type(code, 'BBB');
    await user.click(screen.getByRole('button', { name: 'Find event' }));
    expect(await screen.findByText('Other Swap')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'My display name' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Join' })).toBeVisible();
    expect(screen.queryByText(notice)).not.toBeInTheDocument();
  });
});
