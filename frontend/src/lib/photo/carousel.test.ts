import { describe, expect, it } from 'vitest';

import { indexFromScroll, linearScrollAt, nextTarget, SLIDE_DURATION_MS } from './carousel';

describe('carousel position', () => {
  it.each([
    [0, 300, 3, 0],
    [310, 300, 3, 1],
    [9999, 300, 3, 2],
    [-50, 300, 3, 0],
    [100, 300, 0, 0],
    [100, 0, 3, 0],
  ])('maps scroll %i, width %i and count %i to index %i', (scroll, width, count, expected) => {
    expect(indexFromScroll(scroll, width, count)).toBe(expected);
  });
  it.each([
    [0, 300, 150, 300, 150],
    [0, 300, 300, 300, 300],
    [0, 300, 400, 300, 300],
    [50, 300, 0, 300, 50],
    [300, 0, 150, 300, 150],
  ])('interpolates from %i to %i at %i / %i', (from, to, elapsed, duration, expected) => {
    expect(linearScrollAt(from, to, elapsed, duration)).toBe(expected);
  });
  it.each([
    [0, null, 1, 3, 1],
    [0, 1, 1, 3, 2],
    [2, null, 1, 3, 2],
    [0, null, -1, 3, 0],
    [1, 2, -1, 3, 1],
  ] as const)(
    'targets from index %i and pending %s in direction %i',
    (index, pending, dir, count, expected) => {
      expect(nextTarget(index, pending, dir, count)).toBe(expected);
    },
  );
  it('uses a 300 ms slide duration', () => expect(SLIDE_DURATION_MS).toBe(300));
});
