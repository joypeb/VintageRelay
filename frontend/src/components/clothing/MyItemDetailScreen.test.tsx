import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MyItemDetailScreen } from '@/components/clothing/MyItemDetailScreen';
import { ApiError } from '@/lib/api/api-error';
import { useClothingQuery, useDeleteClothingMutation } from '@/lib/api/clothing';
import { useEventQuery } from '@/lib/api/events';
import { routes } from '@/lib/routes';
import { saveEventSession } from '@/lib/session';
import { renderWithClient } from '@/test/render';
import type { Clothing } from '@/types/clothing';
import type { Event } from '@/types/event';

vi.mock('@/lib/api/clothing', () => ({ useClothingQuery: vi.fn(), useDeleteClothingMutation: vi.fn() }));
vi.mock('@/lib/api/events', () => ({ useEventQuery: vi.fn() }));
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));

import '@/test/dialog-polyfill';

const refetch = vi.fn();
const eventRefetch = vi.fn();
const mutateAsync = vi.fn();
const mutate = vi.fn();

const clothing: Clothing = {
  id: 'c1', eventId: 'e1', owner: { participantId: 'p1', displayName: 'Alex', isOrganizer: false },
  isMine: true, photos: [
    { id: 'p1', url: '/first.jpg' }, { id: 'p2', url: '/second.jpg' }, { id: 'p3', url: '/third.jpg' },
  ],
  category: 'outer', title: 'A long green vintage jacket with a patterned lining',
  description: 'A warm jacket with a patterned lining and carefully repaired pockets.',
  measurements: { totalLength: 28, chest: 21.5, shoulder: 18, sleeve: null, waist: 20, hem: 19, inseam: 30, thigh: 12 },
  status: 'available', contentVersion: 1, analysis: null,
  createdAt: '2026-11-02T05:30:00Z', updatedAt: '2026-11-02T06:00:00Z',
};

const doneAnalysis: NonNullable<Clothing['analysis']> = {
  contentVersion: 1,
  status: 'done',
  features: { colors: ['green'], pattern: null, materialEstimate: null, styleTags: [], visibleDetails: [], sizeLabel: null },
  uncertainties: [],
  modelInfo: { modelId: 'model' },
  updatedAt: '2026-11-04T00:01:00Z',
};

const event: Event = {
  id: 'e1', name: 'Neighborhood swap', status: 'active',
  entryCode: 'K7P3QX', entryUrl: 'http://localhost:3000/join?code=K7P3QX',
  organizerParticipantId: 'p-org', createdAt: '2026-10-28T00:00:00Z', closedAt: null,
  me: { participantId: 'p1', displayName: 'Alex', isOrganizer: false },
  stats: null,
};

type ClothingQueryResult = ReturnType<typeof useClothingQuery>;
type EventQueryResult = ReturnType<typeof useEventQuery>;
type DeleteMutationResult = ReturnType<typeof useDeleteClothingMutation>;

function query(overrides: Partial<ClothingQueryResult> = {}) {
  vi.mocked(useClothingQuery).mockReturnValue({
    data: clothing, error: null, isPending: false, isFetching: false, refetch, ...overrides,
  } as ClothingQueryResult);
}

function eventQuery(overrides: Partial<EventQueryResult> = {}) {
  vi.mocked(useEventQuery).mockReturnValue({
    data: event, error: null, isPending: false, isFetching: false, refetch: eventRefetch, ...overrides,
  } as EventQueryResult);
}

function deleteMutation(overrides: Partial<DeleteMutationResult> = {}) {
  vi.mocked(useDeleteClothingMutation).mockReturnValue({
    mutate, mutateAsync, isPending: false, isError: false, error: null, reset: vi.fn(), ...overrides,
  } as unknown as DeleteMutationResult);
}

function renderDetail() {
  return renderWithClient(<MyItemDetailScreen eventId="e1" clothingId="c1" />);
}

function isDisabled(element: Element | null): boolean {
  if (element === null) return false;
  return (
    (element as HTMLButtonElement).disabled === true ||
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true'
  );
}

describe('MyItemDetailScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    saveEventSession('e1', { participantToken: 'token', participantId: 'p1' });
    refetch.mockReset();
    eventRefetch.mockReset();
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue(undefined);
    mutate.mockReset();
    mutate.mockImplementation((_variables: unknown, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
    query();
    eventQuery();
    deleteMutation();
  });
  afterEach(() => localStorage.clear());

  it('shows the available status', () => {
    renderDetail();
    expect(screen.getByText('Available', { exact: true })).toBeVisible();
  });

  it('does not show the owner attribution on an own item', () => {
    renderDetail();
    expect(screen.queryByText('Offered by')).not.toBeInTheDocument();
  });

  it('places edit and delete before the completed AI estimates', () => {
    query({ data: { ...clothing, analysis: doneAnalysis } });
    renderDetail();
    const heading = screen.getByRole('heading', { name: 'Estimated by AI' });
    expect(screen.getByRole('link', { name: 'Edit' }).compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' }).compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('places the confirmed lock note before the completed AI estimates', () => {
    query({ data: { ...clothing, status: 'confirmed', analysis: doneAnalysis } });
    renderDetail();
    const note = screen.getByText(/This item is locked for an exchange/);
    const heading = screen.getByRole('heading', { name: 'Estimated by AI' });
    expect(note.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not offer edit or delete for a withdrawn item', () => {
    query({ data: { ...clothing, status: 'withdrawn' } });
    renderDetail();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('shows the full detail with enabled Edit and Delete actions', async () => {
    const user = userEvent.setup();
    renderDetail();

    expect(useClothingQuery).toHaveBeenCalledWith('e1', 'c1', { enabled: true });

    // Photos appear in order.
    const images = screen.getAllByRole('img');
    const urls = images.map((img) => img.getAttribute('src'));
    expect(urls).toEqual(['/first.jpg', '/second.jpg', '/third.jpg']);
    const [first, second, third] = images;
    if (!first || !second || !third) throw new Error('Expected three photos');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.getByText('Outer')).toBeVisible();
    expect(screen.getByText(clothing.title)).toBeVisible();
    expect(screen.getByText(clothing.description)).toBeVisible();
    expect(screen.getByText('Total length (in)')).toBeVisible();
    expect(screen.getByText('28')).toBeVisible();

    const editLink = screen.queryByRole('link', { name: /edit/i });
    if (editLink) {
      expect(editLink).toHaveAttribute('href', routes.myItemEdit('e1', 'c1'));
      expect(isDisabled(editLink)).toBe(false);
    } else {
      await user.click(screen.getByRole('button', { name: /edit/i }));
      expect(mocks.push).toHaveBeenCalledWith(routes.myItemEdit('e1', 'c1'));
    }

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton).toBeVisible();
    expect(deleteButton).toBeEnabled();
  });

  it('asks for confirmation before deleting, then withdraws and returns to My items', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete this item?' });
    expect(within(dialog).getByText(/delete/i)).toBeVisible();
    expect(mutate).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /delete|confirm|withdraw/i }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(routes.myItems('e1')));
    expect(mutate.mock.calls.length + mutateAsync.mock.calls.length).toBeGreaterThan(0);
    expect(useDeleteClothingMutation).toHaveBeenCalledWith('e1', 'c1');
  });

  it('cancels deletion without withdrawing or navigating', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel|keep|back/i }));

    expect(mutate).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByText(clothing.title)).toBeVisible();
  });

  it('locks confirmed garments with cancellation guidance', () => {
    query({ data: { ...clothing, status: 'confirmed' } });
    renderDetail();

    expect(screen.getByText(/confirmed/i)).toBeVisible();
    expect(screen.getByText(/cancel/i)).toBeVisible();

    const edit =
      screen.queryByRole('link', { name: /edit/i }) ?? screen.queryByRole('button', { name: /edit/i });
    if (edit) expect(isDisabled(edit)).toBe(true);
    const deleteButton = screen.queryByRole('button', { name: 'Delete' });
    if (deleteButton) expect(isDisabled(deleteButton)).toBe(true);

    expect(mutate).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the withdrawn badge', () => {
    query({ data: { ...clothing, status: 'withdrawn' } });
    renderDetail();

    expect(screen.getByText(/withdrawn/i)).toBeVisible();
    expect(screen.getByText(clothing.title)).toBeVisible();
  });

  it('disables Edit and Delete when the event is closed', () => {
    eventQuery({ data: { ...event, status: 'closed', closedAt: '2026-10-28T01:00:00Z' } });
    renderDetail();

    expect(screen.getByText(clothing.title)).toBeVisible();
    const edit =
      screen.queryByRole('link', { name: /edit/i }) ?? screen.queryByRole('button', { name: /edit/i });
    expect(edit).not.toBeNull();
    expect(isDisabled(edit)).toBe(true);
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(isDisabled(deleteButton)).toBe(true);
    expect(mutate).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('shows item not-found copy and a link home', () => {
    query({ data: undefined, error: new ApiError(404, 'NOT_FOUND', 'Not found.') });
    renderDetail();

    expect(screen.getByText('This clothing item could not be found.')).toBeVisible();
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', routes.eventHome('e1'));
    expect(screen.queryByText(clothing.title)).not.toBeInTheDocument();
  });

  it('shows no access for an unauthenticated request', () => {
    query({ data: undefined, error: new ApiError(401, 'UNAUTHENTICATED', 'Session expired.') });
    renderDetail();

    expect(screen.getByText("You haven't joined this event on this device.")).toBeVisible();
    expect(screen.queryByText(clothing.title)).not.toBeInTheDocument();
  });

  it('keeps the Requests placeholder empty or hidden (020 out of scope)', () => {
    renderDetail();

    expect(screen.queryByRole('button', { name: /request exchange/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /decline/i })).not.toBeInTheDocument();

    for (const node of screen.queryAllByText(/^requests$/i)) {
      const section = node.closest('section') ?? node.parentElement;
      if (section) {
        expect(within(section).queryByRole('button', { name: /accept|decline/i })).toBeNull();
      }
    }
  });

  it('shows loading instead of the detail', () => {
    query({ data: undefined, error: null, isPending: true });
    renderDetail();

    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText(clothing.title)).not.toBeInTheDocument();
  });

  it('shows a retryable error when loading fails', async () => {
    const user = userEvent.setup();
    query({ data: undefined, error: new ApiError(0, 'NETWORK_ERROR', 'Unable to connect.') });
    renderDetail();

    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.queryByText(clothing.title)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
