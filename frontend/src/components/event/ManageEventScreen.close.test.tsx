import { QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageEventScreen } from '@/components/event/ManageEventScreen';
import { ApiError } from '@/lib/api/api-error';
import { queryKeys } from '@/lib/api/query-keys';
import { saveEventSession } from '@/lib/session';
import { renderWithClient } from '@/test/render';
import type { Event } from '@/types/event';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiFetch }));
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));

const token = 'secret-token-xyz';
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
const closedEvent: Event = {
  ...activeEvent,
  status: 'closed',
  closedAt: '2026-10-29T09:00:00Z',
  stats: { participantCount: 7, availableClothingCount: 4, confirmedExchangeCount: 5 },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function posts() {
  return apiFetch.mock.calls.filter(
    (call) => (call[2] as RequestInit | undefined)?.method === 'POST',
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Close event' }));
  return screen.getByRole('dialog', { name: 'Close this event?' });
}

function isBusy(button: HTMLElement) {
  return (
    button.hasAttribute('disabled') ||
    button.getAttribute('aria-disabled') === 'true' ||
    button.getAttribute('aria-busy') === 'true'
  );
}

describe('US1 close event', () => {
  beforeEach(() => {
    localStorage.clear();
    apiFetch.mockReset();
    saveEventSession('e1', { participantToken: token, participantId: 'p-org' });
    apiFetch.mockImplementation((_id: string, _path: string, init?: RequestInit) =>
      Promise.resolve(init?.method === 'POST' ? closedEvent : activeEvent),
    );
  });
  afterEach(() => localStorage.clear());

  it('shows the active state label under the heading', async () => {
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient: createClient() });
    const heading = await screen.findByRole('heading', { name: 'Manage event' });
    const label = screen.getByText('Active', { exact: true });
    expect(heading.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the closed state label under the heading for cached closed data', async () => {
    const queryClient = createClient();
    queryClient.setQueryData(queryKeys.event('e1'), closedEvent);
    apiFetch.mockImplementation(() => new Promise(() => {}));
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient });
    const heading = await screen.findByRole('heading', { name: 'Manage event' });
    const label = screen.getByText('Closed', { exact: true });
    expect(heading.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens the confirmation dialog without sending a POST', async () => {
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient: createClient() });
    expect(await openDialog(user)).toBeVisible();
    expect(posts()).toHaveLength(0);
  });

  it('cancels without sending a POST and keeps the close action', async () => {
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient: createClient() });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Close this event?' })).not.toBeInTheDocument();
    expect(posts()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Close event' })).toBeVisible();
  });

  it('sends one POST and keeps confirmation busy while pending', async () => {
    const post = deferred<Event>();
    apiFetch.mockImplementation((_id: string, _path: string, init?: RequestInit) =>
      init?.method === 'POST' ? post.promise : Promise.resolve(activeEvent),
    );
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient: createClient() });
    const dialog = await openDialog(user);
    const confirm = within(dialog).getByRole('button', { name: 'Close event' });
    await user.click(confirm);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.[1]).toBe('/events/e1/close');
    await waitFor(() => expect(isBusy(confirm)).toBe(true));
    await user.click(confirm);
    expect(posts()).toHaveLength(1);
  });

  it('shows the returned closed event immediately while the follow-up GET is pending', async () => {
    const post = deferred<Event>();
    const followUp = deferred<Event>();
    let reads = 0;
    apiFetch.mockImplementation((_id: string, _path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return post.promise;
      return ++reads === 1 ? Promise.resolve(activeEvent) : followUp.promise;
    });
    const queryClient = createClient();
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Close event' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await act(async () => post.resolve(closedEvent));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Close this event?' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Event closed').closest('[role="status"]')).not.toBeNull();
    expect(screen.getByText('Closed', { exact: true })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Close event' })).not.toBeInTheDocument();
    for (const [label, value] of [
      ['Participants', '7'],
      ['Available garments', '4'],
      ['Confirmed exchanges', '5'],
    ] as const) {
      expect(
        within(screen.getByText(label, { exact: true }).parentElement as HTMLElement).getByText(
          value,
          { exact: true },
        ),
      ).toBeVisible();
    }
    expect(queryClient.getQueryData(queryKeys.event('e1'))).toEqual(closedEvent);
    await waitFor(() => expect(reads).toBeGreaterThan(1));
  });

  it('clears an error when the dialog is reopened', async () => {
    apiFetch.mockImplementation((_id: string, _path: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Promise.reject(new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'))
        : Promise.resolve(activeEvent),
    );
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient: createClient() });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Close event' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server says no.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const reopened = await openDialog(user);
    expect(within(reopened).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the close action busy after remount while a POST is pending', async () => {
    const post = deferred<Event>();
    apiFetch.mockImplementation((_id: string, _path: string, init?: RequestInit) =>
      init?.method === 'POST' ? post.promise : Promise.resolve(activeEvent),
    );
    const queryClient = createClient();
    const user = userEvent.setup();
    const view = renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Close event' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    view.unmount();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient });
    const button = await screen.findByRole('button', { name: 'Close event' });
    await waitFor(() => expect(isBusy(button)).toBe(true));
    await user.click(button);
    expect(posts()).toHaveLength(1);
  });

  it('regression guard: hides the close action from regular participants', async () => {
    apiFetch.mockResolvedValue({
      ...activeEvent,
      me: { participantId: 'p-joon', displayName: 'Joon', isOrganizer: false },
      stats: null,
    });
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient: createClient() });
    expect(await screen.findByText('Only the organizer can manage this event.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Close event' })).not.toBeInTheDocument();
  });

  it('regression guard: hides the close action for a closed event', async () => {
    apiFetch.mockResolvedValue(closedEvent);
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient: createClient() });
    expect(await screen.findByRole('heading', { name: 'Manage event' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Close event' })).not.toBeInTheDocument();
  });

  it('regression guard: never renders the participant token', async () => {
    const { container } = renderWithClient(<ManageEventScreen eventId="e1" />, {
      queryClient: createClient(),
    });
    await screen.findByRole('heading', { name: 'Manage event' });
    expect(container).not.toHaveTextContent(token);
  });
});

describe('US2 close failures', () => {
  beforeEach(() => {
    localStorage.clear();
    apiFetch.mockReset();
    saveEventSession('e1', { participantToken: token, participantId: 'p-org' });
  });
  afterEach(() => localStorage.clear());

  it.each([
    {
      name: 'network error',
      response: () =>
        Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.')),
      message: 'Please check your network connection.',
    },
    {
      name: 'internal error',
      response: () => Promise.reject(new ApiError(500, 'INTERNAL_ERROR', 'Server says no.')),
      message: 'Server says no.',
    },
    {
      name: 'active response',
      response: () => Promise.resolve(activeEvent),
      message: 'Something went wrong. Please try again.',
    },
  ])('keeps the dialog open and allows retry after a $name', async ({ response, message }) => {
    let reads = 0;
    apiFetch.mockImplementation((_id: string, _path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return response();
      reads += 1;
      return Promise.resolve(activeEvent);
    });
    const user = userEvent.setup();
    const { container } = renderWithClient(<ManageEventScreen eventId="e1" />, {
      queryClient: createClient(),
    });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Close event' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(2));
    expect(screen.getByRole('dialog', { name: 'Close this event?' })).toBeVisible();
    expect(
      within(container)
        .getAllByRole('button', { name: 'Close event', hidden: true })
        .some((button) => !dialog.contains(button)),
    ).toBe(true);
    expect(screen.queryByText('Event closed')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close event' }));
    await waitFor(() => expect(posts()).toHaveLength(2));
  });

  it.each([
    { code: 'FORBIDDEN', status: 403, message: 'Only the organizer can manage this event.' },
    {
      code: 'UNAUTHENTICATED',
      status: 401,
      message: "You haven't joined this event on this device.",
    },
    { code: 'NOT_FOUND', status: 404, message: 'This event could not be found.' },
  ] as const)('shows the screen-level view for $code', async ({ code, status, message }) => {
    let reads = 0;
    apiFetch.mockImplementation((_id: string, _path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.reject(new ApiError(status, code, 'Denied.'));
      reads += 1;
      return Promise.resolve(activeEvent);
    });
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient: createClient() });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Close event' }));
    expect(await screen.findByText(message)).toBeVisible();
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(2));
    expect(screen.queryByRole('dialog', { name: 'Close this event?' })).not.toBeInTheDocument();
    if (code === 'FORBIDDEN') {
      expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
        'href',
        '/events/e1',
      );
      expect(screen.queryByText('Participants', { exact: true })).not.toBeInTheDocument();
      expect(screen.queryByText('Available garments', { exact: true })).not.toBeInTheDocument();
      expect(screen.queryByText('Confirmed exchanges', { exact: true })).not.toBeInTheDocument();
    } else {
      expect(screen.getByRole('link', { name: 'Go to start' })).toBeVisible();
      if (code === 'UNAUTHENTICATED')
        expect(screen.getByRole('link', { name: 'Join with entry code' })).toBeVisible();
    }
  });

  it('shows the closed state when a reload after a network failure reports closure', async () => {
    let reads = 0;
    apiFetch.mockImplementation((_id: string, _path: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return Promise.reject(
          new ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.'),
        );
      return Promise.resolve(++reads === 1 ? activeEvent : closedEvent);
    });
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient: createClient() });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Close event' }));
    await waitFor(() => expect(screen.getByText('Closed', { exact: true })).toBeVisible());
    expect(screen.queryByRole('dialog', { name: 'Close this event?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close event' })).not.toBeInTheDocument();
  });

  it('closes an idle dialog when the event query receives a closed event', async () => {
    apiFetch.mockResolvedValue(activeEvent);
    const queryClient = createClient();
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient });
    await openDialog(user);
    act(() => queryClient.setQueryData(queryKeys.event('e1'), closedEvent));
    await waitFor(() => expect(screen.getByText('Closed', { exact: true })).toBeVisible());
    expect(screen.queryByRole('dialog', { name: 'Close this event?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close event' })).not.toBeInTheDocument();
  });
});

describe('US3 already closed', () => {
  beforeEach(() => {
    localStorage.clear();
    apiFetch.mockReset();
    saveEventSession('e1', { participantToken: token, participantId: 'p-org' });
  });
  afterEach(() => localStorage.clear());

  it('treats an already-closed response as success and preserves its closure time', async () => {
    const originalClosure = { ...closedEvent, closedAt: '2026-10-27T09:00:00Z' };
    const followUp = deferred<Event>();
    let reads = 0;
    apiFetch.mockImplementation((_id: string, _path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(originalClosure);
      return ++reads === 1 ? Promise.resolve(activeEvent) : followUp.promise;
    });
    const queryClient = createClient();
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Close event' }));

    expect((await screen.findByText('Event closed')).closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Closed', { exact: true })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Close event' })).not.toBeInTheDocument();
    expect(queryClient.getQueryData<Event>(queryKeys.event('e1'))?.closedAt).toBe(
      '2026-10-27T09:00:00Z',
    );
  });

  it('regression guard: hides the close action when the event query becomes closed', async () => {
    apiFetch.mockResolvedValue(activeEvent);
    const queryClient = createClient();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient });
    expect(await screen.findByRole('button', { name: 'Close event' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => queryClient.setQueryData(queryKeys.event('e1'), closedEvent));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Close event' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Closed', { exact: true })).toBeVisible();
  });
});

describe('R9 focus after H3 closes', () => {
  beforeEach(() => {
    localStorage.clear();
    apiFetch.mockReset();
    saveEventSession('e1', { participantToken: token, participantId: 'p-org' });
  });
  afterEach(() => localStorage.clear());

  it('announces success when the event closes while the close request is pending', async () => {
    const post = deferred<Event>();
    apiFetch.mockImplementation((_id: string, _path: string, init?: RequestInit) =>
      init?.method === 'POST' ? post.promise : Promise.resolve(activeEvent),
    );
    const queryClient = createClient();
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Close event' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    act(() => queryClient.setQueryData(queryKeys.event('e1'), closedEvent));
    await screen.findByText('Closed', { exact: true });
    await act(async () => post.resolve(closedEvent));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect((await screen.findByText('Event closed')).closest('[role="status"]')).not.toBeNull();
  });

  it('focuses the heading when a reload after failure reports closure', async () => {
    let reads = 0;
    apiFetch.mockImplementation((_id: string, _path: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'Network error.'));
      return Promise.resolve(++reads === 1 ? activeEvent : closedEvent);
    });
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient: createClient() });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Close event' }));
    await screen.findByText('Closed', { exact: true });
    const heading = screen.getByRole('heading', { name: 'Manage event' });
    await waitFor(() => expect(document.activeElement).toBe(heading.closest('[tabindex="-1"]')));
  });

  it('focuses the heading when the event closes while the dialog is open', async () => {
    apiFetch.mockResolvedValue(activeEvent);
    const queryClient = createClient();
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient });
    await openDialog(user);
    act(() => queryClient.setQueryData(queryKeys.event('e1'), closedEvent));
    await screen.findByText('Closed', { exact: true });
    const heading = screen.getByRole('heading', { name: 'Manage event' });
    await waitFor(() => expect(document.activeElement).toBe(heading.closest('[tabindex="-1"]')));
  });

  it('does not move focus on an initial closed event', async () => {
    apiFetch.mockResolvedValue(closedEvent);
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient: createClient() });
    await screen.findByText('Closed', { exact: true });
    expect(document.activeElement).toBe(document.body);
  });

  it.each([
    { code: 'FORBIDDEN', status: 403, message: 'Only the organizer can manage this event.' },
    {
      code: 'UNAUTHENTICATED',
      status: 401,
      message: "You haven't joined this event on this device.",
    },
    { code: 'NOT_FOUND', status: 404, message: 'This event could not be found.' },
  ] as const)('focuses the replacement view for $code', async ({ code, status, message }) => {
    apiFetch.mockImplementation((_id: string, _path: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Promise.reject(new ApiError(status, code, 'Denied.'))
        : Promise.resolve(activeEvent),
    );
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient: createClient() });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Close event' }));
    const messageElement = await screen.findByText(message);
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      const region = messageElement.closest('[tabindex="-1"]');
      expect(region).not.toBeNull();
      expect(region?.contains(document.activeElement)).toBe(true);
    });
  });

  it('returns focus to the close action after cancellation', async () => {
    apiFetch.mockResolvedValue(activeEvent);
    const user = userEvent.setup();
    renderWithClient(<ManageEventScreen eventId="e1" />, { queryClient: createClient() });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close event' })).toHaveFocus());
  });
});
