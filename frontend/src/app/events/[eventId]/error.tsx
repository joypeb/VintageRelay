'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { logger } from '@/lib/logger';
import { routes } from '@/lib/routes';

type EventErrorProps = {
  error: unknown;
  retry: () => void;
};

export default function EventError({ error, retry }: EventErrorProps) {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId;

  useEffect(() => {
    logger.error('unexpected event screen error', error);
  }, [error]);

  return (
    <VStack role="alert" gap={6} padding={6} minHeight="100dvh" vAlign="center">
      <VStack gap={2}>
        <Heading level={1}>Unable to load this screen.</Heading>
        <Text type="body" color="secondary">
          Retry, or go back to the event home.
        </Text>
      </VStack>
      <VStack gap={3}>
        <Button label="Retry" variant="primary" size="lg" width="100%" onClick={retry} />
        <Button
          label="Home"
          size="lg"
          width="100%"
          href={eventId ? routes.eventHome(eventId) : routes.landing()}
        />
      </VStack>
    </VStack>
  );
}
