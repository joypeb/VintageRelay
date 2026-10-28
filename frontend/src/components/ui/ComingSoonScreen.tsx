import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { routes } from '@/lib/routes';

export function ComingSoonScreen({ title }: { title: string }) {
  return (
    <VStack gap={6} padding={6} minHeight="100dvh" vAlign="center">
      <VStack gap={2}>
        <Heading level={1}>{title}</Heading>
        <Text type="body" color="secondary">
          This screen is coming soon.
        </Text>
      </VStack>
      <Button label="Go to start" size="lg" width="100%" href={routes.landing()} />
    </VStack>
  );
}
