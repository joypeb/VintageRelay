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
});
