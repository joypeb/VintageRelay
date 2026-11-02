import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EventHeaderMenu } from '@/components/ui/EventHeaderMenu';
import { installMatchMedia } from '@/test/match-media';
import { renderWithClient } from '@/test/render';
import type { Event } from '@/types/event';

const event: Event = {
  id: 'e1',
  name: 'Swap Corner',
  status: 'active',
  entryCode: 'K7P3QX',
  entryUrl: 'http://localhost:3000/join?code=K7P3QX',
  organizerParticipantId: 'p-org',
  createdAt: '2026-10-28T00:00:00Z',
  closedAt: null,
  me: { participantId: 'p-org', displayName: 'Mina', isOrganizer: true },
  stats: null,
};

describe('event header menu', () => {
  let restoreMatchMedia: () => void;

  beforeEach(() => {
    restoreMatchMedia = installMatchMedia();
  });

  afterEach(() => {
    restoreMatchMedia();
  });

  it('offers event management to the organizer of an active event', async () => {
    const user = userEvent.setup();
    renderWithClient(<EventHeaderMenu event={event} />);

    await user.click(screen.getByRole('button', { name: /more|menu/i }));
    expect(screen.getByRole('link', { name: 'Manage event' })).toHaveAttribute(
      'href',
      '/events/e1/manage',
    );
  });

  it('hides management from a non-organizer even if the organizer flag is true', () => {
    renderWithClient(
      <EventHeaderMenu
        event={{ ...event, me: { ...event.me, participantId: 'p-other', isOrganizer: true } }}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Manage event' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more|menu/i })).not.toBeInTheDocument();
  });

  it('hides management from the organizer when the event is closed', () => {
    renderWithClient(
      <EventHeaderMenu event={{ ...event, status: 'closed', closedAt: '2026-10-29T00:00:00Z' }} />,
    );

    expect(screen.queryByRole('link', { name: 'Manage event' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more|menu/i })).not.toBeInTheDocument();
  });
});
