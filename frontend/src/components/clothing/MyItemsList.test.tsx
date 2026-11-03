import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MyItemsList } from '@/components/clothing/MyItemsList';
import { useMyItemsQuery } from '@/lib/api/clothing';
import { routes } from '@/lib/routes';
import { saveEventSession } from '@/lib/session';
import { renderWithClient } from '@/test/render';
import type { Clothing } from '@/types/clothing';

vi.mock('@/lib/api/clothing', () => ({ useMyItemsQuery: vi.fn() }));

const refetch = vi.fn();

function makeItem(overrides: Partial<Clothing> & { id: string }): Clothing {
  return {
    eventId: 'e1',
    owner: { participantId: 'p1', displayName: 'Owner', isOrganizer: false },
    isMine: true,
    photos: [{ id: `${overrides.id}-photo`, url: `/${overrides.id}.jpg` }],
    category: 'top',
    title: overrides.id,
    description: 'Description',
    measurements: null,
    status: 'available',
    contentVersion: 1,
    analysis: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const newerAvailable = makeItem({
  id: 'newer',
  title: 'Newer jacket',
  status: 'available',
  createdAt: '2026-10-03T00:00:00Z',
});
const middleConfirmed = makeItem({
  id: 'middle',
  title: 'Middle coat',
  status: 'confirmed',
  createdAt: '2026-10-02T00:00:00Z',
});
const olderWithdrawn = makeItem({
  id: 'older',
  title: 'Older shirt',
  status: 'withdrawn',
  createdAt: '2026-10-01T00:00:00Z',
});
const othersGarment = makeItem({
  id: 'others',
  title: 'Someone else garment',
  isMine: false,
  createdAt: '2026-10-04T00:00:00Z',
});

const myItemDetail = (eventId: string, clothingId: string) =>
  `/events/${encodeURIComponent(eventId)}/my-items/${encodeURIComponent(clothingId)}`;

type QueryResult = ReturnType<typeof useMyItemsQuery>;
function query(overrides: Partial<QueryResult> = {}) {
  vi.mocked(useMyItemsQuery).mockReturnValue({
    data: { items: [newerAvailable, middleConfirmed, olderWithdrawn], nextCursor: null },
    error: null,
    isPending: false,
    isFetching: false,
    refetch,
    ...overrides,
  } as QueryResult);
}

describe('MyItemsList', () => {
  beforeEach(() => {
    localStorage.clear();
    saveEventSession('e1', { participantToken: 'token', participantId: 'p1' });
    refetch.mockReset();
    query();
  });
  afterEach(() => localStorage.clear());

  it('shows own garments newest first with main photo, title, and status badge', () => {
    renderWithClient(<MyItemsList eventId="e1" />);
    expect(screen.getByRole('link', { name: /Register item/i })).toHaveAttribute(
      'href',
      routes.newItem('e1'),
    );
    const links = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') !== routes.newItem('e1'));
    expect(links).toHaveLength(3);
    const [first, second, third] = links;
    if (!first || !second || !third) throw new Error('Expected three item rows');
    expect(first).toHaveAttribute('href', myItemDetail('e1', newerAvailable.id));
    expect(second).toHaveAttribute('href', myItemDetail('e1', middleConfirmed.id));
    expect(third).toHaveAttribute('href', myItemDetail('e1', olderWithdrawn.id));
    for (const [link, item] of [
      [first, newerAvailable],
      [second, middleConfirmed],
      [third, olderWithdrawn],
    ] as const) {
      const photo = item.photos[0];
      if (!photo) throw new Error('Expected a main photo');
      const image = within(link).getByRole('img', { name: item.title });
      expect(image).toHaveAttribute('src', photo.url);
      expect(within(link).getByText(item.title)).toBeVisible();
      expect(within(link).getByText(new RegExp(item.status, 'i'))).toBeVisible();
    }
  });

  it.each([
    ['available', 'Available'],
    ['withdrawn', 'Withdrawn'],
  ] as const)('shows a separate analysis state in a %s row link', (status, label) => {
    const item = makeItem({
      id: 'pending',
      title: 'Pending jacket',
      status,
      analysis: {
        contentVersion: 1,
        status: 'pending',
        features: null,
        uncertainties: [],
        modelInfo: null,
        updatedAt: '2026-11-04T00:00:00Z',
      },
    });
    query({ data: { items: [item], nextCursor: null } });
    renderWithClient(<MyItemsList eventId="e1" />);

    const link = screen.getByRole('link', { name: /Pending jacket/i });
    expect(link).toHaveAttribute('href', myItemDetail('e1', item.id));
    expect(within(link).getByRole('img', { name: item.title })).toBeVisible();
    expect(within(link).getByText(item.title)).toBeVisible();
    const statusLabel = within(link).getByText(label, { exact: true });
    const analyzing = within(link).getByText('AI analyzing…', { exact: true });
    expect(statusLabel).toBeVisible();
    expect(analyzing).toBeVisible();
    expect(statusLabel).not.toBe(analyzing);
    expect(link).not.toHaveTextContent('Registration is complete; analysis runs in the background.');
    expect(link).not.toHaveTextContent('Analysis runs in the background.');
  });

  it('sorts rows newest first even when the response is oldest first', () => {
    query({ data: { items: [olderWithdrawn, middleConfirmed, newerAvailable], nextCursor: null } });
    renderWithClient(<MyItemsList eventId="e1" />);
    const newerLink = screen.getByRole('link', { name: /Newer jacket/i });
    const olderLink = screen.getByRole('link', { name: /Older shirt/i });
    expect(newerLink.compareDocumentPosition(olderLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('links each row to the my-item detail (C4)', () => {
    renderWithClient(<MyItemsList eventId="e1" />);
    expect(screen.getByRole('link', { name: /Newer jacket/i })).toHaveAttribute(
      'href',
      myItemDetail('e1', newerAvailable.id),
    );
    expect(screen.getByRole('link', { name: /Older shirt/i })).toHaveAttribute(
      'href',
      myItemDetail('e1', olderWithdrawn.id),
    );
  });

  it('never shows other participants garments', () => {
    query({
      data: { items: [newerAvailable, othersGarment, olderWithdrawn], nextCursor: null },
    });
    renderWithClient(<MyItemsList eventId="e1" />);
    expect(screen.queryByText(othersGarment.title)).not.toBeInTheDocument();
    expect(screen.getByText(newerAvailable.title)).toBeVisible();
    expect(screen.getByText(olderWithdrawn.title)).toBeVisible();
  });

  it('invites registration when the caller owns no garments', () => {
    query({ data: { items: [], nextCursor: null } });
    renderWithClient(<MyItemsList eventId="e1" />);
    expect(screen.getByRole('link', { name: /Register item/i })).toHaveAttribute(
      'href',
      routes.newItem('e1'),
    );
  });

  it('shows loading instead of rows', () => {
    query({ isPending: true });
    renderWithClient(<MyItemsList eventId="e1" />);
    expect(screen.getByRole('region', { name: /loading/i })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(newerAvailable.title)).not.toBeInTheDocument();
  });

  it('shows an error instead of rows and retries', async () => {
    query({ error: new Error('Unable to load your items.') });
    renderWithClient(<MyItemsList eventId="e1" />);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.queryByText(newerAvailable.title)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
