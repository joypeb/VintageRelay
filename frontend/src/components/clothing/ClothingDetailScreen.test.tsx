import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClothingDetailScreen } from '@/components/clothing/ClothingDetailScreen';
import { ApiError } from '@/lib/api/api-error';
import { useClothingQuery } from '@/lib/api/clothing';
import { routes } from '@/lib/routes';
import { saveEventSession } from '@/lib/session';
import { renderWithClient } from '@/test/render';
import type { Clothing } from '@/types/clothing';

vi.mock('@/lib/api/clothing', () => ({ useClothingQuery: vi.fn() }));
const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));

const refetch = vi.fn();
const clothing: Clothing = {
  id: 'c1', eventId: 'e1', owner: { participantId: 'p1', displayName: 'Alex', isOrganizer: true },
  isMine: false, photos: [
    { id: 'p1', url: '/first.jpg' }, { id: 'p2', url: '/second.jpg' }, { id: 'p3', url: '/third.jpg' },
  ],
  category: 'outer', title: 'A long green vintage jacket with a patterned lining',
  description: 'A warm jacket with a patterned lining and carefully repaired pockets.',
  measurements: { totalLength: 28, chest: 21.5, shoulder: 18, sleeve: null, waist: 20, hem: 19, inseam: 30, thigh: 12 },
  status: 'available', contentVersion: 1, analysis: null,
  createdAt: '2026-11-02T05:30:00Z', updatedAt: '2026-11-02T06:00:00Z',
};
type QueryResult = ReturnType<typeof useClothingQuery>;
function query(overrides: Partial<QueryResult> = {}) {
  vi.mocked(useClothingQuery).mockReturnValue({
    data: clothing, error: null, isPending: false, isFetching: false, refetch, ...overrides,
  } as QueryResult);
}
function renderDetail() {
  return renderWithClient(<ClothingDetailScreen eventId="e1" clothingId="c1" />);
}

describe('Clothing detail', () => {
  beforeEach(() => {
    localStorage.clear();
    saveEventSession('e1', { participantToken: 'token', participantId: 'viewer' });
    refetch.mockReset();
    query();
  });
  afterEach(() => localStorage.clear());

  it('renders a back link to the home grid', () => {
    renderDetail();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', routes.eventHome('e1'));
  });

  it('labels the owner attribution', () => {
    renderDetail();
    expect(screen.getByText('Offered by')).toBeVisible();
    expect(screen.getByText(clothing.owner.displayName, { exact: true })).toBeVisible();
  });

  it('shows all photos in order in the carousel and the complete garment details', () => {
    renderDetail();
    expect(useClothingQuery).toHaveBeenCalledWith('e1', 'c1', { enabled: true });
    const carousel = screen.getByRole('region', { name: 'Photo carousel' });
    const frames = within(carousel).getAllByRole('group');
    expect(frames).toHaveLength(3);
    frames.forEach((frame, index) => {
      expect(frame).toHaveAccessibleName(`Photo ${index + 1} of 3`);
      expect(within(frame).getByRole('img')).toHaveAttribute('src', clothing.photos[index]?.url);
    });
    expect(within(carousel).getByText('1 / 3')).toBeVisible();
    expect(screen.getByText('Outer')).toBeVisible();
    expect(screen.getByText(clothing.title)).toBeVisible();
    expect(screen.getByText(clothing.description)).toBeVisible();
  });

  it('shows a fallback and prevents opening a failed photo', () => {
    renderDetail();
    const frame = screen.getByRole('group', { name: 'Photo 2 of 3' });
    fireEvent.error(within(frame).getByRole('img'));
    expect(within(frame).getByText(/image.*unavailable|photo.*unavailable|unable to load.*photo/i)).toBeVisible();
    expect(within(frame).queryByRole('button', { name: /view full photo/i })).not.toBeInTheDocument();
  });

  it('shows every non-null measurement in inches and omits null fields', () => {
    renderDetail();
    const pairs: Array<[string, string]> = [
      ['Total length', '28'], ['Chest', '21.5'], ['Shoulder', '18'],
      ['Waist', '20'], ['Hem', '19'], ['Inseam', '30'], ['Thigh', '12'],
    ];
    for (const [label, value] of pairs) {
      expect(screen.getByText(`${label} (in)`)).toBeVisible();
      expect(screen.getByText(value)).toBeVisible();
    }
    expect(screen.queryByText('Sleeve (in)')).not.toBeInTheDocument();
  });

  it('shows legacy measurements outside the current category', () => {
    query({ data: { ...clothing, category: 'bottom', measurements: { totalLength: 28, chest: 21.5, shoulder: 18, sleeve: 24, waist: 20, hem: 19, inseam: 30, thigh: 12 } } });
    renderDetail();
    expect(screen.getByText('Sleeve (in)')).toBeVisible();
    expect(screen.getByText('24')).toBeVisible();
  });

  it('omits the measurements section when measurements are null', () => {
    query({ data: { ...clothing, measurements: null } });
    renderDetail();
    expect(screen.queryByText(/measurements|\(in\)|inches/i)).not.toBeInTheDocument();
  });

  it('shows the organizer badge with the organizer owner', () => {
    renderDetail();
    expect(screen.getByText('Alex')).toBeVisible();
    expect(screen.getByText(/organizer/i)).toBeVisible();
  });

  it('does not show the organizer badge for another owner', () => {
    query({ data: { ...clothing, owner: { ...clothing.owner, displayName: 'Jamie', isOrganizer: false } } });
    renderDetail();
    expect(screen.getByText('Jamie')).toBeVisible();
    expect(screen.queryByText(/organizer/i)).not.toBeInTheDocument();
  });

  it('shows withdrawn status alongside the disabled coming-soon request', () => {
    query({ data: { ...clothing, status: 'withdrawn' } });
    renderDetail();
    expect(screen.getByText(/withdrawn/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /request exchange/i })).toBeDisabled();
    expect(screen.getByText(/coming soon/i)).toBeVisible();
  });

  it('does not request an exchange or navigate when the disabled action is clicked', async () => {
    mocks.apiFetch.mockClear();
    mocks.push.mockClear();
    mocks.replace.mockClear();
    renderDetail();
    const location = window.location.href;
    const button = screen.getByRole('button', { name: /request exchange/i });
    expect(button).toBeVisible();
    expect(button).toBeDisabled();
    expect(screen.getByText(/coming soon/i)).toBeVisible();

    await userEvent.click(button);

    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(window.location.href).toBe(location);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows item not-found copy and a link home', () => {
    query({ error: new ApiError(404, 'NOT_FOUND', 'Not found.') });
    renderDetail();
    expect(screen.getByText('This clothing item could not be found.')).toBeVisible();
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', routes.eventHome('e1'));
    expect(screen.queryByText(clothing.title)).not.toBeInTheDocument();
  });

  it('shows no access for an unauthenticated request', () => {
    query({ error: new ApiError(401, 'UNAUTHENTICATED', 'Session expired.') });
    renderDetail();
    expect(screen.getByText("You haven't joined this event on this device.")).toBeVisible();
    expect(screen.queryByText(clothing.title)).not.toBeInTheDocument();
  });

  it('shows a network error and retries the request', async () => {
    query({ error: new ApiError(0, 'NETWORK_ERROR', 'Unable to connect.') });
    renderDetail();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.queryByText(clothing.title)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
  it('shows a retryable error when the first load fails', () => {
    query({ data: undefined, error: new ApiError(0, 'NETWORK_ERROR', 'Network error') });
    renderDetail();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.queryByText(/could not be found/i)).not.toBeInTheDocument();
  });

});
