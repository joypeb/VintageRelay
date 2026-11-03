import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EditClothingForm } from '@/components/clothing/EditClothingForm';
import { ApiError } from '@/lib/api/api-error';
import { useClothingQuery, useUpdateClothingMutation } from '@/lib/api/clothing';
import { useEventQuery } from '@/lib/api/events';
import { routes } from '@/lib/routes';
import { saveEventSession } from '@/lib/session';
import '@/test/dialog-polyfill';
import { installMatchMedia } from '@/test/match-media';
import { renderWithClient } from '@/test/render';
import type { Clothing } from '@/types/clothing';
import type { Event } from '@/types/event';

vi.mock('@/lib/api/clothing', () => ({
  useClothingQuery: vi.fn(),
  useUpdateClothingMutation: vi.fn(),
}));
vi.mock('@/lib/api/events', () => ({ useEventQuery: vi.fn() }));
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

type ClothingQueryResult = ReturnType<typeof useClothingQuery>;
type EventQueryResult = ReturnType<typeof useEventQuery>;
type UpdateMutationResult = ReturnType<typeof useUpdateClothingMutation>;

const clothing: Clothing = {
  id: 'c1',
  eventId: 'e1',
  owner: { participantId: 'p1', displayName: 'Alex', isOrganizer: false },
  isMine: true,
  photos: [
    { id: 'ph1', url: '/first.jpg' },
    { id: 'ph2', url: '/second.jpg' },
  ],
  category: 'top',
  title: 'Green jacket',
  description: 'A warm jacket',
  measurements: {
    totalLength: 28,
    chest: 21.5,
    shoulder: 18,
    sleeve: 22,
    waist: null,
    hem: null,
    inseam: null,
    thigh: null,
  },
  status: 'available',
  contentVersion: 3,
  analysis: null,
  createdAt: '2026-11-02T05:30:00Z',
  updatedAt: '2026-11-02T06:00:00Z',
};

const event: Event = {
  id: 'e1',
  name: 'Neighborhood swap',
  status: 'active',
  entryCode: 'K7P3QX',
  entryUrl: 'http://localhost:3000/join?code=K7P3QX',
  organizerParticipantId: 'p-org',
  createdAt: '2026-10-28T00:00:00Z',
  closedAt: null,
  me: { participantId: 'p1', displayName: 'Alex', isOrganizer: false },
  stats: null,
};

const mutate = vi.fn();
const mutateAsync = vi.fn();

function query(overrides: Partial<ClothingQueryResult> = {}) {
  vi.mocked(useClothingQuery).mockReturnValue({
    data: clothing,
    error: null,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  } as ClothingQueryResult);
}

function eventQuery(overrides: Partial<EventQueryResult> = {}) {
  vi.mocked(useEventQuery).mockReturnValue({
    data: event,
    error: null,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  } as EventQueryResult);
}

function updateMutation(overrides: Partial<UpdateMutationResult> = {}) {
  vi.mocked(useUpdateClothingMutation).mockReturnValue({
    mutate,
    mutateAsync,
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
    ...overrides,
  } as unknown as UpdateMutationResult);
}

let restoreMatchMedia: () => void;

beforeEach(() => {
  restoreMatchMedia = installMatchMedia();
  localStorage.clear();
  saveEventSession('e1', { participantToken: 'token', participantId: 'p1' });
  mutate.mockReset();
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue(clothing);
  mutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.();
  });
  mocks.push.mockReset();
  mocks.replace.mockReset();
  query();
  eventQuery();
  updateMutation();
});

afterEach(() => {
  restoreMatchMedia();
  localStorage.clear();
});

async function chooseCategory(user: ReturnType<typeof userEvent.setup>, category: string) {
  await user.click(screen.getByRole('combobox', { name: /category/i }));
  await user.click(await screen.findByRole('option', { name: category }));
}

describe('EditClothingForm', () => {
  it('prefills existing photos as ready in order plus title, description, category, and measurements', async () => {
    renderWithClient(<EditClothingForm eventId="e1" clothingId="c1" />);

    expect(useClothingQuery).toHaveBeenCalledWith('e1', 'c1', { enabled: true });

    const images = await screen.findAllByRole('img');
    expect(images.map((img) => img.getAttribute('src'))).toEqual(['/first.jpg', '/second.jpg']);

    expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('Green jacket');
    expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('A warm jacket');
    expect(screen.getByRole('combobox', { name: /category/i })).toHaveTextContent('Top');
    expect(screen.getByRole('textbox', { name: 'Chest (in)' })).toHaveValue('21.5');
  });

  it('saves the whole photo list and whole measurements object via PATCH', async () => {
    const user = userEvent.setup();
    renderWithClient(<EditClothingForm eventId="e1" clothingId="c1" />);

    const title = await screen.findByRole('textbox', { name: /title/i });
    await user.clear(title);
    await user.type(title, ' Green jacket edited ');
    await chooseCategory(user, 'Top');
    const chest = screen.getByRole('textbox', { name: 'Chest (in)' });
    await user.clear(chest);
    await user.type(chest, '22');

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(mutate.mock.calls.length + mutateAsync.mock.calls.length).toBeGreaterThan(0));
    const body = (mutate.mock.calls[0]?.[0] ?? mutateAsync.mock.calls[0]?.[0]) as {
      photoIds: string[];
      title: string;
      measurements: Record<string, number>;
    };
    expect(body.photoIds).toEqual(['ph1', 'ph2']);
    expect(body.title).toBe('Green jacket edited');
    expect(body.measurements).toEqual({ totalLength: 28, chest: 22, shoulder: 18, sleeve: 22 });
    expect(useUpdateClothingMutation).toHaveBeenCalledWith('e1', 'c1');
  });

  it('maps server validation errors and keeps the draft', async () => {
    const user = userEvent.setup();
    mutate.mockImplementation(() => {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid.', {
        fields: [
          { field: 'title', reason: 'too_long' },
          { field: 'measurements.chest', reason: 'invalid' },
        ],
      });
    });
    mutateAsync.mockRejectedValue(
      new ApiError(422, 'VALIDATION_ERROR', 'Invalid.', {
        fields: [
          { field: 'title', reason: 'too_long' },
          { field: 'measurements.chest', reason: 'invalid' },
        ],
      }),
    );
    renderWithClient(<EditClothingForm eventId="e1" clothingId="c1" />);

    await user.click(await screen.findByRole('button', { name: /save/i }));

    expect(await screen.findByText('Use 100 characters or fewer.')).toBeVisible();
    expect(screen.getByText('Enter a number from 0.1 to 120.')).toBeVisible();
    expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('Green jacket');
  });

  it('navigates to the item detail with a saved flag on success', async () => {
    const user = userEvent.setup();
    renderWithClient(<EditClothingForm eventId="e1" clothingId="c1" />);

    await user.click(await screen.findByRole('button', { name: /save/i }));

    const expected = `${routes.myItemDetail('e1', 'c1')}?saved=1`;
    await waitFor(() =>
      expect([...mocks.push.mock.calls, ...mocks.replace.mock.calls].flat()).toContain(expected),
    );
  });
});
