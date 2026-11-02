'use client';

import { useSyncExternalStore } from 'react';

import { Link } from '@astryxdesign/core/Link';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';

import { getEventShellVisibility } from '@/components/ui/ClosedEventGuards';
import { useEventQuery } from '@/lib/api/events';
import { isOrganizer } from '@/lib/event';
import { routes } from '@/lib/routes';
import { hasEventSession } from '@/lib/session';
import type { Event } from '@/types/event';

export function EventHeaderMenu({ event }: { event: Event }) {
  const visibility = getEventShellVisibility(event.status, isOrganizer(event));
  if (!visibility.manageEvent) return null;

  return (
    <MoreMenu
      presentation="adaptive"
      alignment="end"
      variant="ghost"
      items={[{ label: <Link href={routes.manageEvent(event.id)}>Manage event</Link> }]}
    />
  );
}

const subscribe = () => () => {};

export function EventHeaderMenuSlot({ eventId }: { eventId: string }) {
  // localStorage is unavailable during SSR, so the session-gated query stays
  // disabled until the client has mounted; the menu renders nothing meanwhile.
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const hasSession = isMounted && hasEventSession(eventId);
  const { data } = useEventQuery(eventId, { enabled: hasSession });

  if (!isMounted || !data) return null;
  return <EventHeaderMenu event={data} />;
}
