import { describe, expect, it } from 'vitest';

import { getActiveTab } from './BottomTabBar';

describe('active event tab', () => {
  it.each([
    ['/events/e1', 'home'],
    ['/events/e1/search', 'search'],
    ['/events/e1/trades', 'trades'],
    ['/events/e1/my-items', 'my-items'],
    ['/events/e1/search/results', 'search'],
    ['/events/e1/trades/t1', 'trades'],
    ['/events/e1/my-items/new', 'my-items'],
  ])('selects %s as %s', (pathname, activeTab) => {
    expect(getActiveTab(pathname, 'e1')).toBe(activeTab);
  });

  it('does not highlight a tab on the manage route', () => {
    expect(getActiveTab('/events/e1/manage', 'e1')).toBeUndefined();
  });
});
