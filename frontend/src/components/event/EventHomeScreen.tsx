'use client';

import { useSyncExternalStore } from 'react';

import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Heading } from '@astryxdesign/core/Heading';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { useEventQuery } from '@/lib/api/events';
import { getEventScreenState, isClosed, isOrganizer } from '@/lib/event';
import { routes } from '@/lib/routes';
import { hasEventSession } from '@/lib/session';

const subscribe = () => () => {};

export function EventHomeScreen({ eventId }: { eventId: string }) {
  // localStorage is unavailable during SSR, so render nothing until the client has mounted.
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const hasSession = isMounted && hasEventSession(eventId);
  const { data, error, isPending } = useEventQuery(eventId, { enabled: hasSession });

  if (!isMounted) return null;

  const state = getEventScreenState({ hasSession, data, error, isPending });

  if (state.kind === 'loading') {
    return (
      // Astryx layout components don't forward aria attributes, so a minimal element marks the busy region.
      <section aria-busy="true" aria-label="Loading event">
        <VStack gap={4} padding={6}>
          <Skeleton width="70%" height={32} />
          <Skeleton width="30%" height={24} />
          <Skeleton width="50%" height={20} />
          <Skeleton height={72} />
        </VStack>
      </section>
    );
  }

  if (state.kind !== 'ready') return null;

  const { event } = state;
  const organizer = isOrganizer(event);
  const closed = isClosed(event);

  return (
    <VStack gap={6} padding={6}>
      <VStack gap={2}>
        <Heading level={1}>{event.name}</Heading>
        <Badge label={closed ? 'Closed' : 'Active'} variant={closed ? 'neutral' : 'success'} />
        <Text type="body" color="secondary">
          {`You: ${event.me.displayName}${organizer ? ' (Organizer)' : ''}`}
        </Text>
      </VStack>
      {organizer && (
        <ClickableCard label="Manage event" href={routes.manageEvent(eventId)}>
          <VStack gap={1}>
            <Text type="label">Manage event</Text>
            <Text type="body" color="secondary">
              View QR, entry code, and event counts
            </Text>
          </VStack>
        </ClickableCard>
      )}
      {!closed && (
        <Button
          label="Register my clothes"
          variant="primary"
          size="lg"
          width="100%"
          href={routes.newItem(eventId)}
        />
      )}
    </VStack>
  );
}
