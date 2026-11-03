'use client';

import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';

import { Badge } from '@astryxdesign/core/Badge';
import { Tab, TabList } from '@astryxdesign/core/TabList';

import { useEventQuery } from '@/lib/api/events';
import { useIntentsQuery } from '@/lib/api/intents';
import { useProposalsQuery } from '@/lib/api/proposals';
import { routes } from '@/lib/routes';
import { hasEventSession } from '@/lib/session';
import { countTradesBadge } from '@/lib/trades';

export type BottomTabId = 'home' | 'search' | 'trades' | 'my-items';

export function getActiveTab(pathname: string, eventId: string): BottomTabId | undefined {
  const base = `/events/${encodeURIComponent(eventId)}`;
  if (pathname === base || pathname === `${base}/`) return 'home';
  if (pathname === `${base}/manage` || pathname.startsWith(`${base}/manage/`)) return undefined;
  if (pathname === `${base}/search` || pathname.startsWith(`${base}/search/`)) return 'search';
  if (pathname === `${base}/trades` || pathname.startsWith(`${base}/trades/`)) return 'trades';
  if (pathname === `${base}/my-items` || pathname.startsWith(`${base}/my-items/`)) return 'my-items';
  return 'home';
}

const subscribe = () => () => {};

export function BottomTabBar({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const active = getActiveTab(pathname, eventId);
  const isMounted = useSyncExternalStore(subscribe, () => true, () => false);
  const enabled = isMounted && hasEventSession(eventId);
  const eventQuery = useEventQuery(eventId, { enabled });
  const closed = eventQuery.data?.status === 'closed';
  const receivedQuery = useIntentsQuery(eventId, {
    direction: 'received',
    enabled,
    closed,
  });
  const proposalsQuery = useProposalsQuery(eventId, { status: 'pending', enabled, closed });
  const badge =
    enabled && receivedQuery.data && proposalsQuery.data
      ? countTradesBadge(receivedQuery.data.items, proposalsQuery.data.items)
      : 0;

  // Link navigation drives the selected value from the pathname; the manage
  // route matches no tab, so an empty value leaves every tab unhighlighted.
  return (
    <TabList
      value={active ?? ''}
      onChange={() => undefined}
      layout="fill"
      size="lg"
      className="sticky bottom-0 bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <Tab value="home" label="Home" href={routes.eventHome(eventId)} />
      <Tab value="search" label="Search" href={routes.search(eventId)} />
      <Tab
        value="trades"
        label="Trades"
        href={routes.trades(eventId)}
        endContent={badge > 0 ? <Badge label={String(badge)} variant="info" /> : undefined}
      />
      <Tab value="my-items" label="My items" href={routes.myItems(eventId)} />
    </TabList>
  );
}
