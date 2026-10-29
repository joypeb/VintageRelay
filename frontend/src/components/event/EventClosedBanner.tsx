'use client';

import { useSyncExternalStore } from 'react';

import { Banner } from '@astryxdesign/core/Banner';

import { useEventQuery } from '@/lib/api/events';
import { hasEventSession } from '@/lib/session';
import { formatDateTime } from '@/lib/utils/date';

const subscribe = () => () => {};

export function EventClosedBanner({ eventId }: { eventId: string }) {
  // localStorage is unavailable during SSR, so render nothing until the client has mounted.
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const hasSession = isMounted && hasEventSession(eventId);
  const { data } = useEventQuery(eventId, { enabled: hasSession });

  if (!isMounted || data?.status !== 'closed' || typeof data.closedAt !== 'string') return null;

  return (
    <Banner
      status="warning"
      title="This event has ended."
      description={`Closed ${formatDateTime(data.closedAt)}`}
    />
  );
}
