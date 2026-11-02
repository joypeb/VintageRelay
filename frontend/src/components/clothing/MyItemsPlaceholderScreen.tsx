'use client';

import { useSyncExternalStore } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';

import { getEventShellVisibility } from '@/components/ui/ClosedEventGuards';
import { useEventQuery } from '@/lib/api/events';
import { isOrganizer } from '@/lib/event';
import { routes } from '@/lib/routes';
import { hasEventSession } from '@/lib/session';

const subscribe = () => () => {};

export function MyItemsPlaceholderScreen({ eventId }: { eventId: string }) {
  // localStorage is unavailable during SSR, so the session-gated query stays
  // disabled until the client has mounted; the placeholder renders meanwhile.
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const hasSession = isMounted && hasEventSession(eventId);
  const { data } = useEventQuery(eventId, { enabled: hasSession });
  const visibility = getEventShellVisibility(
    hasSession && data ? data.status : 'closed',
    data ? isOrganizer(data) : false,
  );

  return (
    <EmptyState
      title="No items yet"
      description="Register your first item to start swapping."
      headingLevel={1}
      actions={
        visibility.registerItem ? (
          <Button
            label="+ Register item"
            variant="primary"
            size="lg"
            href={routes.newItem(eventId)}
          />
        ) : undefined
      }
    />
  );
}
