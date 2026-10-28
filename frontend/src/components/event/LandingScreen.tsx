import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { routes } from '@/lib/routes';

export function LandingScreen() {
  return (
    <VStack gap={8} padding={6} minHeight="100dvh" vAlign="center">
      <VStack gap={2}>
        <Heading level={1}>Vintage Relay</Heading>
        <Text type="body">Event clothing exchange corner</Text>
        <Text type="body" color="secondary">
          Give one garment, receive one garment
        </Text>
      </VStack>
      <VStack gap={3}>
        <Button
          label="Create event"
          variant="primary"
          size="lg"
          width="100%"
          href={routes.createEvent()}
        />
        <Button label="Join with entry code" size="lg" width="100%" href={routes.join()} />
        <Text type="body" color="secondary">
          Scan the event QR with your phone camera to join
        </Text>
      </VStack>
    </VStack>
  );
}
