import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { parseClothing, parseClothingItem, parseClothingList } from '@/lib/validation/clothing-response';

const clothing = {
  id: 'c1',
  eventId: 'e1',
  owner: { participantId: 'p1', displayName: 'Alex', isOrganizer: true },
  isMine: false,
  photos: [
    { id: 'photo1', url: 'https://example.com/photo1.jpg' },
    { id: 'photo2', url: 'https://example.com/photo2.jpg' },
  ],
  category: 'outer',
  title: 'Green jacket',
  description: 'A warm jacket',
  measurements: {
    totalLength: 28,
    chest: 21.5,
    shoulder: 18,
    sleeve: 24,
    waist: 20,
    hem: 19,
    inseam: 30,
    thigh: 12,
  },
  status: 'available',
  contentVersion: 1,
  analysis: null,
  createdAt: '2026-11-02T05:30:00Z',
  updatedAt: '2026-11-02T06:00:00Z',
};

const nullMeasurements = {
  totalLength: null,
  chest: null,
  shoulder: null,
  sleeve: null,
  waist: null,
  hem: null,
  inseam: null,
  thigh: null,
};

describe('parseClothingItem', () => {
  it('preserves all fields and the order of photos and measurements', () => {
    expect(parseClothingItem(clothing)).toEqual(clothing);
  });

  it.each([nullMeasurements, null])('accepts empty measurements', (measurements) => {
    const item = { ...clothing, measurements };
    expect(parseClothingItem(item)).toEqual(item);
  });

  it('preserves withdrawn status', () => {
    const item = { ...clothing, status: 'withdrawn' };
    expect(parseClothingItem(item)).toEqual(item);
  });

  const { id: _id, ...withoutId } = clothing;
  void _id;
  it.each([
    ['missing ID', withoutId],
    ['invalid category', { ...clothing, category: 'shoes' }],
    ['empty photos', { ...clothing, photos: [] }],
  ])('rejects %s with an unexpected response error', (_description, item) => {
    try {
      parseClothingItem(item);
      expect.fail('Expected an ApiError');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
    }
  });
});

describe('parseClothingList', () => {
  it('preserves two items and the null cursor', () => {
    const list = { items: [clothing, { ...clothing, id: 'c2' }], nextCursor: null };
    expect(parseClothingList(list)).toEqual(list);
  });
});

describe('parseClothing', () => {
  it('continues to parse an ID-only registration response', () => {
    expect(parseClothing({ id: 'c1' })).toEqual({ id: 'c1' });
  });
});
