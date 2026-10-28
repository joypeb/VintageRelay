import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateEventScreen } from '@/components/event/CreateEventScreen';
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
    useCreateEventMutation: () => useMutation({ mutationFn: (body: CreateEventRequest) => mocks.createEvent(body), retry: 0 }),
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
