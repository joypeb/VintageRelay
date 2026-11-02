import { describe, expect, it } from 'vitest';

import { getEventShellVisibility } from './ClosedEventGuards';

describe('event shell visibility', () => {
  it.each(['active', 'closed'] as const)('keeps all tabs readable when %s', (status) => {
    expect(getEventShellVisibility(status, true).tabs).toEqual([
      'home',
      'search',
      'trades',
      'my-items',
    ]);
  });

  it('shows management and registration for an active event organizer', () => {
    expect(getEventShellVisibility('active', true)).toMatchObject({
      manageEvent: true,
      registerItem: true,
    });
  });

  it('hides management for an active event participant who is not the organizer', () => {
    expect(getEventShellVisibility('active', false)).toMatchObject({
      manageEvent: false,
      registerItem: true,
    });
  });

  it('hides management and registration when the event is closed', () => {
    expect(getEventShellVisibility('closed', true)).toMatchObject({
      manageEvent: false,
      registerItem: false,
    });
  });
});
