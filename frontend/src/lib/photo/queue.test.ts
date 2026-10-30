import { describe, expect, it } from 'vitest';

import {
  canProceed,
  initialPhotoQueueState,
  nextToStart,
  photoQueueReducer,
} from '@/lib/photo/queue';

// Actions: add { items }, start { key, status }, prepared { key, file },
// uploaded { key, photo }, failed { key, message }, remove/retry { key }, next, back.
// add records its overflow in lastSkipped; supplied items have deterministic keys and previews.
const items = Array.from({ length: 12 }, (_, i) => ({
  key: String(i),
  file: new File([String(i)], `${i}.jpg`, { type: 'image/jpeg' }),
  previewUrl: `blob:${i}`,
}));
const photo = {
  id: 'p',
  url: '/p',
  contentType: 'image/jpeg' as const,
  sizeBytes: 1,
  createdAt: '2026-01-01T00:00:00Z',
};
const add = (count: number) =>
  photoQueueReducer(initialPhotoQueueState, { type: 'add', items: items.slice(0, count) });

describe('photo queue', () => {
  it('keeps the first ten additions in order and reports skipped files', () => {
    const state = add(12);
    expect(state.items.map((item) => [item.key, item.status])).toEqual(
      items.slice(0, 10).map((item) => [item.key, 'waiting']),
    );
    expect(state.lastSkipped).toBe(2);
    const extra = items[10];
    if (!extra) throw new Error('Missing test item');
    const full = photoQueueReducer(state, { type: 'add', items: [extra] });
    expect(full.items).toEqual(state.items);
    expect(full.lastSkipped).toBe(1);
  });

  it('starts the first waiting item only when none is active', () => {
    const state = add(2);
    expect(nextToStart(state)?.key).toBe('0');
    for (const status of ['preparing', 'uploading'] as const) {
      const active = photoQueueReducer(state, { type: 'start', key: '0', status });
      expect(nextToStart(active)).toBeNull();
    }
  });

  it('applies each upload transition only to its matching key', () => {
    const state = add(2);
    const preparing = photoQueueReducer(state, { type: 'start', key: '0', status: 'preparing' });
    expect(preparing.items[0]).toMatchObject({ status: 'preparing' });
    expect(preparing.items[1]).toEqual(state.items[1]);
    const file = new File(['compressed'], 'compressed.jpg', { type: 'image/jpeg' });
    const uploading = photoQueueReducer(preparing, { type: 'prepared', key: '0', file });
    expect(uploading.items[0]).toMatchObject({ status: 'uploading', file });
    expect(uploading.items[1]).toEqual(state.items[1]);
    const ready = photoQueueReducer(uploading, { type: 'uploaded', key: '0', photo });
    expect(ready.items[0]).toMatchObject({ status: 'ready', photo });
    expect(ready.items[1]).toEqual(state.items[1]);
    const failed = photoQueueReducer(uploading, { type: 'failed', key: '0', message: 'Failed' });
    expect(failed.items[0]).toMatchObject({ status: 'failed', error: 'Failed' });
    expect(failed.items[1]).toEqual(state.items[1]);
  });

  it('locks active items and permits removal of other items', () => {
    for (const status of ['preparing', 'uploading'] as const) {
      const active = photoQueueReducer(add(2), { type: 'start', key: '0', status });
      expect(photoQueueReducer(active, { type: 'remove', key: '0' }).items).toEqual(active.items);
      expect(
        photoQueueReducer(active, { type: 'remove', key: '1' }).items.map((item) => item.key),
      ).toEqual(['0']);
    }
    const ready = photoQueueReducer(add(1), { type: 'uploaded', key: '0', photo });
    expect(photoQueueReducer(ready, { type: 'remove', key: '0' }).items).toHaveLength(0);
    const failed = photoQueueReducer(add(1), { type: 'failed', key: '0', message: 'Failed' });
    expect(photoQueueReducer(failed, { type: 'remove', key: '0' }).items).toHaveLength(0);
  });

  it('retries a failed item at the end of the queue', () => {
    const failed = photoQueueReducer(add(2), { type: 'failed', key: '0', message: 'Failed' });
    const retried = photoQueueReducer(failed, { type: 'retry', key: '0' });
    expect(retried.items.map((item) => [item.key, item.status])).toEqual([
      ['1', 'waiting'],
      ['0', 'waiting'],
    ]);
    expect(nextToStart(retried)?.key).toBe('1');
  });

  it('allows next only with at least one photo and all ready, and back preserves items', () => {
    const empty = add(0);
    const waiting = add(2);
    const oneReady = photoQueueReducer(waiting, { type: 'uploaded', key: '0', photo });
    const allReady = photoQueueReducer(oneReady, { type: 'uploaded', key: '1', photo });
    for (const state of [
      empty,
      waiting,
      oneReady,
      photoQueueReducer(waiting, { type: 'failed', key: '0', message: 'Failed' }),
    ]) {
      expect(canProceed(state)).toBe(false);
      expect(photoQueueReducer(state, { type: 'next' }).step).toBe(1);
    }
    expect(canProceed(allReady)).toBe(true);
    const next = photoQueueReducer(allReady, { type: 'next' });
    expect(next.step).toBe(2);
    const back = photoQueueReducer(next, { type: 'back' });
    expect(back.step).toBe(1);
    expect(back.items).toEqual(allReady.items);
  });
});
