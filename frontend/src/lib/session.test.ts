import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getEventSession,
  getEventShare,
  getSessionHeaders,
  hasEventSession,
  isStorageAvailable,
  saveEventSession,
} from '@/lib/session';

const record = {
  participantToken: 't1',
  participantId: 'p1',
  share: { name: 'N', entryCode: 'K7P3QX', entryUrl: 'http://localhost:3000/join?code=K7P3QX' },
};

describe('event session storage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('stores and reads the session and share under the event key', () => {
    saveEventSession('e1', record);
    expect(localStorage.getItem('vr:event:e1')).toBe(JSON.stringify(record));
    expect(getEventSession('e1')).toEqual(record);
    expect(getEventShare('e1')).toEqual(record.share);
  });

  it('does not change another event when saving a session', () => {
    saveEventSession('e1', record);
    const original = localStorage.getItem('vr:event:e1');
    saveEventSession('e2', { participantToken: 't2', participantId: 'p2' });
    expect(localStorage.getItem('vr:event:e1')).toBe(original);
    expect(getEventSession('e2')).toEqual({ participantToken: 't2', participantId: 'p2' });
  });

  it.each([
    ['missing key', null],
    ['invalid JSON', '{'],
    [
      'empty token',
      JSON.stringify({ participantToken: '', participantId: 'p1', share: record.share }),
    ],
    ['missing participant ID', JSON.stringify({ participantToken: 't1', share: record.share })],
  ])('returns null for %s', (_case, stored) => {
    if (stored !== null) localStorage.setItem('vr:event:e1', stored);
    expect(getEventSession('e1')).toBeNull();
    expect(getEventShare('e1')).toBeNull();
  });

  it('returns authorization only for a known event', () => {
    saveEventSession('e1', record);
    expect(getSessionHeaders('e1')).toEqual({ Authorization: 'Bearer t1' });
    expect(getSessionHeaders('unknown')).toEqual({});
  });

  describe('hasEventSession', () => {
    it('returns true for a saved session and false for an unknown event', () => {
      saveEventSession('e1', { participantToken: 't1', participantId: 'p1' });
      expect(hasEventSession('e1')).toBe(true);
      expect(hasEventSession('unknown')).toBe(false);
    });

    it.each([
      ['invalid JSON', '{'],
      ['empty participant token', JSON.stringify({ participantToken: '', participantId: 'p1' })],
    ])('returns false for %s', (_case, stored) => {
      localStorage.setItem('vr:event:e1', stored);
      expect(hasEventSession('e1')).toBe(false);
    });
  });

  it('detects available storage without leaving a probe key', () => {
    localStorage.setItem('existing', 'value');
    expect(isStorageAvailable()).toBe(true);
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('existing')).toBe('value');
  });

  it('detects unavailable storage when writing throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    expect(isStorageAvailable()).toBe(false);
  });
});
