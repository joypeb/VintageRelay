'use client';

import { useMemo, useSyncExternalStore } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { EventShareCard } from '@/components/event/EventShareCard';
import { routes } from '@/lib/routes';
import { getEventShare } from '@/lib/session';

const subscribe = () => () => {};

export function EventCreatedScreen({ eventId }: { eventId: string }) {
  // localStorage is unavailable during SSR, so render nothing until the client has mounted.
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const share = useMemo(() => (isMounted ? getEventShare(eventId) : null), [isMounted, eventId]);

  if (!isMounted) return null;

  if (!share) {
    return (
      <VStack gap={6} padding={6} minHeight="100dvh" vAlign="center">
        <Text type="body">This event&apos;s share details aren&apos;t saved on this device.</Text>
        <Button label="Go to start" size="lg" width="100%" href={routes.landing()} />
      </VStack>
    );
  }

  return (
    <VStack gap={6} padding={6}>
      <VStack gap={2}>
        <Heading level={1}>Event created</Heading>
        <Text type="large">{share.name}</Text>
        <Text type="body" color="secondary">
          Share the QR code or entry code with participants
        </Text>
      </VStack>
      <EventShareCard name={share.name} entryCode={share.entryCode} entryUrl={share.entryUrl} />
      <Text type="body" color="secondary">
        Organizer access is stored on this device. Use the same device until the event ends.
      </Text>
      <VStack gap={3}>
        <Button
          label="Register my clothes"
          variant="primary"
          size="lg"
          width="100%"
          href={routes.newItem(eventId)}
        />
        <Button label="Go home" size="lg" width="100%" href={routes.eventHome(eventId)} />
      </VStack>
    </VStack>
  );
}
