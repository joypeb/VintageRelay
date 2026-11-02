import { describe, expect, it } from 'vitest';

import { routes } from '@/lib/routes';

describe('routes', () => {
  it('builds the screen paths', () => {
    expect(routes.landing()).toBe('/');
    expect(routes.createEvent()).toBe('/events/new');
    expect(routes.eventCreated('e1')).toBe('/events/e1/created');
    expect(routes.join()).toBe('/join');
    expect(routes.eventHome('e1')).toBe('/events/e1');
    expect(routes.newItem('e1')).toBe('/events/e1/my-items/new');
  });

  it('encodes event IDs in the created screen path', () => {
    expect(routes.eventCreated('a/b')).toBe('/events/a%2Fb/created');
  });

  it('builds and encodes the manage event path', () => {
    expect(routes.manageEvent('e1')).toBe('/events/e1/manage');
    expect(routes.manageEvent('a/b')).toBe('/events/a%2Fb/manage');
  });

  it('builds and encodes the search path', () => {
    expect(routes.search('e1')).toBe('/events/e1/search');
    expect(routes.search('a/b')).toBe('/events/a%2Fb/search');
  });

  it('builds and encodes the trades path', () => {
    expect(routes.trades('e1')).toBe('/events/e1/trades');
    expect(routes.trades('a/b')).toBe('/events/a%2Fb/trades');
  });

  it('builds and encodes the my items path', () => {
    expect(routes.myItems('e1')).toBe('/events/e1/my-items');
    expect(routes.myItems('a/b')).toBe('/events/a%2Fb/my-items');
  });
});
