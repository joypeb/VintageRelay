import type { ReactElement } from 'react';

import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import MyItemsNewPage from '@/app/events/[eventId]/(tabs)/my-items/new/page';
import { saveEventSession } from '@/lib/session';
import { renderWithClient } from '@/test/render';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));

const renderPage = MyItemsNewPage as unknown as (props: {
  params: Promise<{ eventId: string }>;
}) => Promise<ReactElement>;

it('shows the clothing photo step instead of the coming soon placeholder', async () => {
  localStorage.clear();
  saveEventSession('e1', { participantToken: 'token', participantId: 'p1' });
  mocks.apiFetch.mockResolvedValue({
    id: 'e1',
    name: 'Mangwon Swap',
    status: 'active',
    entryCode: 'K7P3QX',
    entryUrl: 'http://localhost:3000/join?code=K7P3QX',
    organizerParticipantId: 'p-org',
    createdAt: '2026-10-28T00:00:00Z',
    closedAt: null,
    me: { participantId: 'p1', displayName: 'Mina', isOrganizer: false },
    stats: null,
  });

  renderWithClient(await renderPage({ params: Promise.resolve({ eventId: 'e1' }) }));

  expect(await screen.findByLabelText('Clothing photos')).toBeVisible();
  expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
});
