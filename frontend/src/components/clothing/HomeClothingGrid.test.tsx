import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeClothingGrid } from '@/components/clothing/HomeClothingGrid';
import { ApiError } from '@/lib/api/api-error';
import { useClothingListQuery } from '@/lib/api/clothing';
import { routes } from '@/lib/routes';
import { saveEventSession } from '@/lib/session';
import { renderWithClient } from '@/test/render';
import type { Clothing } from '@/types/clothing';

vi.mock('@/lib/api/clothing', () => ({ useClothingListQuery: vi.fn() }));

const refetch = vi.fn();
const longTitle = 'A very long vintage garment title '.repeat(4).trim();
const older: Clothing = {
  id: 'older', eventId: 'e1', owner: { participantId: 'p1', displayName: 'Owner Alice', isOrganizer: false },
  isMine: false, photos: [{ id: 'a', url: '/older.jpg' }], category: 'top', title: longTitle,
  description: 'Description', measurements: null, status: 'available', contentVersion: 1,
  analysis: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};
const newer: Clothing = {
  ...older, id: 'newer', title: 'Blue jacket', owner: { ...older.owner, displayName: 'Owner Bob' },
  photos: [{ id: 'b', url: '/main.jpg' }, { id: 'c', url: '/second.jpg' }],
  createdAt: '2026-10-02T00:00:00Z',
};
const mine: Clothing = { ...older, id: 'mine', title: 'My garment', isMine: true };
const data = { items: [newer, older, mine], nextCursor: null };
type QueryResult = ReturnType<typeof useClothingListQuery>;
function query(overrides: Partial<QueryResult> = {}) {
  vi.mocked(useClothingListQuery).mockReturnValue({
    data, error: null, isPending: false, isFetching: false, refetch, ...overrides,
  } as QueryResult);
}

describe('Home clothing grid', () => {
  beforeEach(() => {
    localStorage.clear();
    saveEventSession('e1', { participantToken: 'token', participantId: 'viewer' });
    refetch.mockReset();
    query();
  });
  afterEach(() => localStorage.clear());

  it('shows newest-first title-only cards with their main photos and detail links', () => {
    renderWithClient(<HomeClothingGrid eventId="e1" />);
    const links = screen.getAllByRole('link').filter((link) =>
      [routes.itemDetail('e1', newer.id), routes.itemDetail('e1', older.id)].includes(link.getAttribute('href') ?? ''),
    );
    expect(links).toHaveLength(2);
    const [firstLink, secondLink] = links;
    if (!firstLink || !secondLink) throw new Error('Expected two item cards');
    expect(firstLink).toHaveAttribute('href', routes.itemDetail('e1', newer.id));
    expect(secondLink).toHaveAttribute('href', routes.itemDetail('e1', older.id));
    for (const [link, clothing] of [[firstLink, newer], [secondLink, older]] as const) {
      const photo = clothing.photos[0];
      if (!photo) throw new Error('Expected a main photo');
      const image = within(link).getByRole('img', { name: clothing.title });
      expect(image).toHaveAttribute('src', photo.url);
      expect(image.compareDocumentPosition(within(link).getByText(clothing.title)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(link).getAllByRole('img')).toHaveLength(1);
    }
    expect(screen.queryByText('Owner Alice')).not.toBeInTheDocument();
    expect(screen.queryByText('Owner Bob')).not.toBeInTheDocument();
    expect(screen.queryByText('My garment')).not.toBeInTheDocument();
  });

  it('keeps the card usable when its photo fails', () => {
    renderWithClient(<HomeClothingGrid eventId="e1" />);
    fireEvent.error(screen.getByRole('img', { name: newer.title }));
    expect(screen.getByText(/image.*unavailable|photo.*unavailable|unable to load.*photo/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /Blue jacket/i })).toHaveAttribute('href', routes.itemDetail('e1', newer.id));
  });

  it('invites registration when no other clothing is available', () => {
    query({ data: { items: [mine], nextCursor: null } });
    renderWithClient(<HomeClothingGrid eventId="e1" />);
    expect(screen.getByText(/no .*clothes|no .*clothing|no .*garments|nothing.*yet/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /register/i })).toHaveAttribute('href', routes.newItem('e1'));
  });

  it('shows loading instead of cached cards', () => {
    query({ isPending: true });
    renderWithClient(<HomeClothingGrid eventId="e1" />);
    expect(screen.getByRole('region', { name: /loading/i })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(newer.title)).not.toBeInTheDocument();
  });

  it('shows an error instead of cached cards and retries', async () => {
    query({ error: new Error('Unable to load clothing.') });
    renderWithClient(<HomeClothingGrid eventId="e1" />);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.queryByText(newer.title)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('shows no access without a session even when cached items exist', () => {
    localStorage.clear();
    renderWithClient(<HomeClothingGrid eventId="e1" />);
    expect(screen.getByText("You haven't joined this event on this device.")).toBeVisible();
    expect(screen.queryByText(newer.title)).not.toBeInTheDocument();
  });

  it('gives unauthenticated errors precedence over cached items', () => {
    query({ error: new ApiError(401, 'UNAUTHENTICATED', 'Session expired.') });
    renderWithClient(<HomeClothingGrid eventId="e1" />);
    expect(screen.getByText("You haven't joined this event on this device.")).toBeVisible();
    expect(screen.queryByText(newer.title)).not.toBeInTheDocument();
  });

  // jsdom has no pull gesture; touch events bubble to the scroll wrapper's handlers (userEvent has no touch API, so fireEvent is used here only).
  it('refreshes the list through a pull gesture', () => {
    renderWithClient(<HomeClothingGrid eventId="e1" />);
    const firstCard = screen.getByRole('link', { name: /Blue jacket/i });
    fireEvent.touchStart(firstCard, { touches: [{ clientX: 0, clientY: 100 }] });
    fireEvent.touchMove(firstCard, { touches: [{ clientX: 0, clientY: 220 }] });
    fireEvent.touchEnd(firstCard);
    expect(refetch).toHaveBeenCalledOnce();
  });
});
