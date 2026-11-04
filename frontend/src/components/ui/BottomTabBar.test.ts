import { createElement } from 'react';

import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithClient } from '@/test/render';

import { BottomTabBar, getActiveTab } from './BottomTabBar';

vi.mock('next/navigation', () => ({ usePathname: () => '/events/e1' }));
vi.mock('@/lib/session', () => ({ hasEventSession: () => true }));
vi.mock('@/lib/api/events', () => ({ useEventQuery: () => ({ data: { status: 'active' } }) }));
vi.mock('@/lib/api/intents', () => ({ useIntentsQuery: () => ({ data: { items: [{ status: 'active', acceptedProposalId: null, offeredClothing: { status: 'confirmed' }, wantedClothing: { status: 'available' } }] } }) }));
vi.mock('@/lib/api/proposals', () => ({ useProposalsQuery: () => ({ data: { items: [] } }) }));

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

it('does not show a trades badge for a request with a confirmed garment', () => {
  renderWithClient(createElement(BottomTabBar, { eventId: 'e1' }));
  expect(screen.getByRole('link', { name: /Trades/ })).toBeInTheDocument();
  expect(screen.queryByText('1')).not.toBeInTheDocument();
});
