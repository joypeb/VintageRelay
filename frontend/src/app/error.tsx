'use client';

import { useEffect } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { logger } from '@/lib/logger';

type RootErrorProps = {
  error: unknown;
  reset: () => void;
};

export default function RootError({ error, reset }: RootErrorProps) {
  useEffect(() => {
    logger.error('unexpected render error', error);
  }, [error]);

  return (
    <VStack role="alert" gap={6} padding={6} minHeight="100dvh" vAlign="center">
      <VStack gap={2}>
        <Heading level={1}>Something went wrong</Heading>
        <Text type="body" color="secondary">
          This screen could not be displayed. Retry, or go back to the start.
        </Text>
      </VStack>
      <VStack gap={3}>
        <Button label="Retry" variant="primary" size="lg" width="100%" onClick={reset} />
        <Button label="Home" size="lg" width="100%" href="/" />
      </VStack>
    </VStack>
  );
}
