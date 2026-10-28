import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

export default function NotFound() {
  return (
    <VStack gap={6} padding={6} minHeight="100dvh" vAlign="center">
      <VStack gap={2}>
        <Heading level={1}>Page not found</Heading>
        <Text type="body" color="secondary">
          The page you are looking for does not exist or has moved.
        </Text>
      </VStack>
      <Button label="Home" variant="primary" size="lg" width="100%" href="/" />
    </VStack>
  );
}
