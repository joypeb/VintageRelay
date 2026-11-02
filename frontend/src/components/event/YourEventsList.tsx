'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { List, ListItem } from '@astryxdesign/core/List';
import { VStack } from '@astryxdesign/core/VStack';
import { useQueries } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';
import { getEvent } from '@/lib/api/events';
import { queryKeys } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { getEventSession, listAllEventSessions, removeEventSession } from '@/lib/session';
import type { EventStatus } from '@/types/event';

const subscribe = () => () => {};

const STATUS_LABEL: Record<EventStatus, string> = {
  active: 'Active',
  closed: 'Closed',
};

// R2/data-model: UNAUTHENTICATED/NOT_FOUND entries are terminal and removed.
function isRemovedSessionError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'UNAUTHENTICATED' || error.code === 'NOT_FOUND')
  );
}

export function YourEventsList() {
  // localStorage is unavailable during SSR, so read sessions only after mount.
  const isMounted = useSyncExternalStore(subscribe, () => true, () => false);
  const sessions = useMemo(() => (isMounted ? listAllEventSessions() : []), [isMounted]);

  const results = useQueries({
    queries: sessions.map(({ eventId }) => ({
      queryKey: queryKeys.event(eventId),
      queryFn: () => getEvent(eventId),
      // One non-polled read per session; transient failures keep a manual retry.
      retry: false,
      refetchOnWindowFocus: false,
      enabled: isMounted,
    })),
  });

  const terminalEventIds = sessions
    .filter((_, index) => isRemovedSessionError(results[index]?.error))
    .map(({ eventId }) => eventId)
    .join(',');

  useEffect(() => {
    if (!isMounted) return;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key === null || !key.startsWith('vr:event:')) continue;
      const eventId = key.slice('vr:event:'.length);
      if (getEventSession(eventId) === null) {
        removeEventSession(eventId);
      }
    }
  }, [isMounted]);

  useEffect(() => {
    if (terminalEventIds.length === 0) return;
    terminalEventIds.split(',').forEach((eventId) => removeEventSession(eventId));
  }, [terminalEventIds]);

  if (!isMounted) return null;

  const hasVisibleRow = results.some(
    (result) => result.data || (result.error && !isRemovedSessionError(result.error)),
  );
  if (!hasVisibleRow) return null;

  return (
    <VStack gap={2}>
      <Heading level={2}>Your events</Heading>
      <List>
        {sessions.map(({ eventId }, index) => {
          const result = results[index];
          if (result?.data) {
            return (
              <ListItem
                key={eventId}
                label={result.data.name}
                description={STATUS_LABEL[result.data.status]}
                href={routes.eventHome(eventId)}
              />
            );
          }
          if (result?.error && !isRemovedSessionError(result.error)) {
            return (
              <ListItem
                key={eventId}
                label="Unknown event"
                description="Could not load this event."
                endContent={<Button label="Retry" onClick={() => void result.refetch()} />}
              />
            );
          }
          return null;
        })}
      </List>
    </VStack>
  );
}
