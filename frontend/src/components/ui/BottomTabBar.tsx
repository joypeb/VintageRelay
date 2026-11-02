'use client';

import { usePathname } from 'next/navigation';

import { Tab, TabList } from '@astryxdesign/core/TabList';

import { routes } from '@/lib/routes';

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

export function BottomTabBar({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const active = getActiveTab(pathname, eventId);

  // Link navigation drives the selected value from the pathname; the manage
  // route matches no tab, so an empty value leaves every tab unhighlighted.
  return (
    <TabList value={active ?? ''} onChange={() => undefined} layout="fill" size="lg">
      <Tab value="home" label="Home" href={routes.eventHome(eventId)} />
      <Tab value="search" label="Search" href={routes.search(eventId)} />
      <Tab value="trades" label="Trades" href={routes.trades(eventId)} />
      <Tab value="my-items" label="My items" href={routes.myItems(eventId)} />
    </TabList>
  );
}
