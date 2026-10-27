import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

// S0 landing placeholder; move the full screen into components/event/ during implementation.
export default function LandingPage() {
  return (
    <VStack gap={8} padding={6} minHeight="100dvh" vAlign="center">
      <VStack gap={2}>
        <Heading level={1}>Vintage Relay</Heading>
        <Text type="body" color="secondary">
          Swap clothes you no longer wear at local events.
        </Text>
      </VStack>
      <VStack gap={3}>
        <Button
          label="Create an event"
          variant="primary"
          size="lg"
          width="100%"
          href="/events/new"
        />
        <Button label="Join with an entry code" size="lg" width="100%" href="/join" />
      </VStack>
    </VStack>
  );
}
