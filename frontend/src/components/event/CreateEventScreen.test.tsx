import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateEventScreen } from '@/components/event/CreateEventScreen';
import { ApiError } from '@/lib/api/api-error';
import { renderWithClient } from '@/test/render';
import type { CreateEventRequest, EventSession } from '@/types/event';

const mocks = vi.hoisted(() => ({
  createEvent: vi.fn<(body: CreateEventRequest) => Promise<EventSession>>(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));

// The real mutation hook calls the mock directly, avoiding same-module binding behavior.
vi.mock('@/lib/api/events', async () => {
  const { useMutation } = await import('@tanstack/react-query');
  return {
    createEvent: mocks.createEvent,
    useCreateEventMutation: () =>
      useMutation({ mutationFn: (body: CreateEventRequest) => mocks.createEvent(body), retry: 0 }),
  };
});

const session: EventSession = {
  event: {
    id: 'e1',
    name: 'Mangwon Flea Market Swap Corner',
    status: 'active',
    entryCode: 'K7P3QX',
    entryUrl: 'http://localhost:3000/join?code=K7P3QX',
    organizerParticipantId: 'p1',
    createdAt: '2026-10-28T00:00:00Z',
    closedAt: null,
    me: { participantId: 'p1', displayName: 'Mina', isOrganizer: true },
    stats: { participantCount: 1, availableClothingCount: 0, confirmedExchangeCount: 0 },
  },
  participantToken: 't1',
};

describe('US1 create', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.createEvent.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows the form labels, notes, and submit button', () => {
    renderWithClient(<CreateEventScreen />);
    expect(screen.getByRole('textbox', { name: 'Event name' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'My display name' })).toBeInTheDocument();
    expect(
      screen.getByText('Creating an event also registers you as a participant.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The event starts immediately. There is no separate start button.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create event' })).toBeInTheDocument();
  });

  it('submits trimmed values once and saves the session before replacing the route', async () => {
    const user = userEvent.setup();
    const other = JSON.stringify({
      participantToken: 'other-token',
      participantId: 'other-participant',
    });
    localStorage.setItem('vr:event:other', other);
    mocks.createEvent.mockResolvedValue(session);
    let savedAtNavigation: string | null = null;
    mocks.replace.mockImplementation(() => {
      savedAtNavigation = localStorage.getItem('vr:event:e1');
    });
    renderWithClient(<CreateEventScreen />);
    await user.type(
      screen.getByRole('textbox', { name: 'Event name' }),
      '  Mangwon Flea Market Swap Corner  ',
    );
    await user.type(screen.getByRole('textbox', { name: 'My display name' }), '  Mina  ');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/events/e1/created'));
    expect(mocks.createEvent).toHaveBeenCalledOnce();
    expect(mocks.createEvent).toHaveBeenCalledWith({
      name: 'Mangwon Flea Market Swap Corner',
      organizerDisplayName: 'Mina',
    });
    expect(JSON.parse(savedAtNavigation ?? 'null')).toEqual({
      participantToken: 't1',
      participantId: 'p1',
      share: {
        name: session.event.name,
        entryCode: session.event.entryCode,
        entryUrl: session.event.entryUrl,
      },
    });
    expect(localStorage.getItem('vr:event:other')).toBe(other);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('blocks a second submission while creation is pending', async () => {
    const user = userEvent.setup();
    mocks.createEvent.mockReturnValue(new Promise<EventSession>(() => {}));
    renderWithClient(<CreateEventScreen />);
    await user.type(screen.getByRole('textbox', { name: 'Event name' }), 'Market');
    await user.type(screen.getByRole('textbox', { name: 'My display name' }), 'Mina');
    const button = screen.getByRole('button', { name: 'Create event' });
    await user.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    await user.click(button);
    expect(mocks.createEvent).toHaveBeenCalledOnce();
  });

  it('moves focus to the display name when Enter is pressed in the event name', async () => {
    const user = userEvent.setup();
    renderWithClient(<CreateEventScreen />);
    await user.click(screen.getByRole('textbox', { name: 'Event name' }));
    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'My display name' })).toHaveFocus();
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });
});

describe('US3 validation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.createEvent.mockReset();
    mocks.createEvent.mockReturnValue(new Promise<EventSession>(() => {}));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows associated required errors and focuses the event name without submitting', async () => {
    const user = userEvent.setup();
    renderWithClient(<CreateEventScreen />);
    const name = screen.getByRole('textbox', { name: 'Event name' });
    const displayName = screen.getByRole('textbox', { name: 'My display name' });
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await screen.findByText('Please enter an event name.')).toBeVisible();
    expect(screen.getByText('Please enter your display name.')).toBeVisible();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(displayName).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Please enter an event name.');
    expect(displayName).toHaveAccessibleDescription('Please enter your display name.');
    expect(name).toHaveFocus();
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it('associates a server validation error with the display name and preserves both values', async () => {
    const user = userEvent.setup();
    mocks.createEvent.mockRejectedValue(
      new ApiError(422, 'VALIDATION_ERROR', 'Invalid.', {
        fields: [{ field: 'organizerDisplayName', reason: 'too_long' }],
      }),
    );
    renderWithClient(<CreateEventScreen />);
    const name = screen.getByRole('textbox', { name: 'Event name' });
    const displayName = screen.getByRole('textbox', { name: 'My display name' });
    await user.type(name, 'Market');
    await user.type(displayName, 'Mina');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await screen.findByText('Use at most 30 characters.')).toBeVisible();
    expect(displayName).toHaveAccessibleDescription('Use at most 30 characters.');
    expect(name).toHaveValue('Market');
    expect(displayName).toHaveValue('Mina');
  });

  it('clears only the edited field error', async () => {
    const user = userEvent.setup();
    const { container } = renderWithClient(<CreateEventScreen />);
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await within(container).findByText('Please enter your display name.')).toBeVisible();
    expect(within(container).getByText('Please enter an event name.')).toBeVisible();
    const displayName = screen.getByRole('textbox', { name: 'My display name' });
    const name = screen.getByRole('textbox', { name: 'Event name' });
    await user.type(displayName, 'M');
    expect(displayName).not.toHaveAttribute('aria-invalid', 'true');
    expect(displayName).not.toHaveAccessibleDescription('Please enter your display name.');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Please enter an event name.');
  });
});

describe('US4 failures', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.createEvent.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows a network error, preserves input, and allows retry', async () => {
    const user = userEvent.setup();
    mocks.createEvent.mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.'),
    );
    const { container } = renderWithClient(<CreateEventScreen />);
    const name = screen.getByRole('textbox', { name: 'Event name' });
    const displayName = screen.getByRole('textbox', { name: 'My display name' });
    const button = screen.getByRole('button', { name: 'Create event' });
    await user.type(name, 'Market');
    await user.type(displayName, 'Mina');
    await user.click(button);
    const message = await within(container).findByText('Please check your network connection.');
    expect(message.closest('[role="alert"]')).not.toBeNull();
    expect(name).toHaveValue('Market');
    expect(displayName).toHaveValue('Mina');
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy', 'true');
    expect(button).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    await waitFor(() => expect(mocks.createEvent).toHaveBeenCalledTimes(2));
  });

  it('shows the server message for an internal error', async () => {
    const user = userEvent.setup();
    mocks.createEvent.mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR', 'Server error. Please retry.'),
    );
    const { container } = renderWithClient(<CreateEventScreen />);
    await user.type(screen.getByRole('textbox', { name: 'Event name' }), 'Market');
    await user.type(screen.getByRole('textbox', { name: 'My display name' }), 'Mina');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await within(container).findByText('Server error. Please retry.')).toBeVisible();
  });

  it('shows a generic message for an unexpected error', async () => {
    const user = userEvent.setup();
    mocks.createEvent.mockRejectedValue(new Error('boom'));
    const { container } = renderWithClient(<CreateEventScreen />);
    await user.type(screen.getByRole('textbox', { name: 'Event name' }), 'Market');
    await user.type(screen.getByRole('textbox', { name: 'My display name' }), 'Mina');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(
      await within(container).findByText('Something went wrong. Please try again.'),
    ).toBeVisible();
    expect(within(container).queryByText('boom')).not.toBeInTheDocument();
  });

  it('explains when the event was created but organizer access could not be saved', async () => {
    const user = userEvent.setup();
    mocks.createEvent.mockResolvedValue(session);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
      if (key.startsWith('vr:event:')) throw new DOMException('full', 'QuotaExceededError');
    });
    const { container } = renderWithClient(<CreateEventScreen />);
    await user.type(screen.getByRole('textbox', { name: 'Event name' }), 'Market');
    await user.type(screen.getByRole('textbox', { name: 'My display name' }), 'Mina');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await waitFor(() => expect(mocks.createEvent).toHaveBeenCalledOnce());
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(container).not.toHaveTextContent('t1');
    const message = await within(container).findByText(
      "Your event was created, but this browser couldn't keep your organizer access. Free up browser storage or open a regular (non-private) window, then create the event again.",
      { exact: true },
    );
    expect(message).toBeVisible();
    expect(message.closest('[role="alert"]')).not.toBeNull();
  });

  it('prevents submission when the device cannot store organizer access', async () => {
    const user = userEvent.setup();
    mocks.createEvent.mockReturnValue(new Promise<EventSession>(() => {}));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { container } = renderWithClient(<CreateEventScreen />);
    await user.type(screen.getByRole('textbox', { name: 'Event name' }), 'Market');
    await user.type(screen.getByRole('textbox', { name: 'My display name' }), 'Mina');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(
      await within(container).findByText(
        "This browser can't keep your organizer access. Open the app in a regular (non-private) window and try again.",
      ),
    ).toBeVisible();
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });
});
