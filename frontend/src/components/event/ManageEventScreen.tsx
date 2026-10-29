'use client';

import { useState, useSyncExternalStore } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { EventShareCard } from '@/components/event/EventShareCard';
import { useEventQuery } from '@/lib/api/events';
import { getEventScreenState, isClosed, isOrganizer } from '@/lib/event';
import { routes } from '@/lib/routes';
import { hasEventSession } from '@/lib/session';

const subscribe = () => () => {};

export function ManageEventScreen({ eventId }: { eventId: string }) {
  // localStorage is unavailable during SSR, so render nothing until the client has mounted.
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [showCloseNotice, setShowCloseNotice] = useState(false);
  const hasSession = isMounted && hasEventSession(eventId);
  const { data, error, isPending, isFetching, refetch } = useEventQuery(eventId, {
    enabled: hasSession,
  });

  if (!isMounted) return null;

  const state = getEventScreenState({ hasSession, data, error, isPending });

  if (state.kind === 'loading') {
    return (
      // Astryx layout components don't forward aria attributes, so a minimal element marks the busy region.
      <section aria-busy="true" aria-label="Loading event">
        <VStack gap={4} padding={6}>
          <Skeleton width="60%" height={32} />
          <Skeleton width="70%" height={24} />
          <Skeleton height={224} />
          <Skeleton height={72} />
        </VStack>
      </section>
    );
  }

  if (state.kind !== 'ready') return null;

  const { event } = state;

  if (!isOrganizer(event)) {
    return (
      <VStack gap={4} padding={6}>
        <Text type="body">Only the organizer can manage this event.</Text>
        <Button label="Back to home" variant="ghost" size="lg" href={routes.eventHome(eventId)} />
      </VStack>
    );
  }

  const counts = [
    ['Participants', event.stats?.participantCount],
    ['Available garments', event.stats?.availableClothingCount],
    ['Confirmed exchanges', event.stats?.confirmedExchangeCount],
  ] as const;

  return (
    <VStack gap={6} padding={6}>
      <VStack gap={2}>
        <Heading level={1}>Manage event</Heading>
        <Text type="body" color="secondary">
          {event.name}
        </Text>
      </VStack>
      <EventShareCard name={event.name} entryCode={event.entryCode} entryUrl={event.entryUrl} />
      <VStack gap={2}>
        {counts.map(([label, value]) => (
          <HStack key={label} gap={2} hAlign="between">
            <Text type="label">{label}</Text>
            <Text type="body">{value}</Text>
          </HStack>
        ))}
      </VStack>
      <VStack gap={3}>
        <Button
          label="Refresh"
          size="lg"
          width="100%"
          isLoading={isFetching}
          onClick={() => void refetch()}
        />
        {!isClosed(event) && (
          <Button
            label="Close event"
            variant="destructive"
            size="lg"
            width="100%"
            onClick={() => setShowCloseNotice(true)}
          />
        )}
        <Text type="body" color="secondary" as="p">
          {/* Always mounted so screen readers announce the text change; Text doesn't forward role. */}
          <span role="status" aria-live="polite">
            {showCloseNotice ? 'Closing the event is coming soon.' : ''}
          </span>
        </Text>
        <Button label="Back to home" variant="ghost" size="lg" href={routes.eventHome(eventId)} />
      </VStack>
    </VStack>
  );
}
