'use client';

import { useEffect } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Theme } from '@astryxdesign/core/theme';

import { defaultThemeSlug, themes } from '@/astryx-themes';
import { logger } from '@/lib/logger';

type GlobalErrorProps = {
  error: unknown;
  reset: () => void;
};

// global-error replaces the root layout, so it renders its own document.
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    logger.error('unexpected root error', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <Theme theme={themes[defaultThemeSlug]}>
          <VStack role="alert" gap={6} padding={6} minHeight="100dvh" vAlign="center">
            <VStack gap={2}>
              <Heading level={1}>Something went wrong</Heading>
              <Text type="body" color="secondary">
                The app could not be loaded. Retry to reload this screen.
              </Text>
            </VStack>
            <Button label="Retry" variant="primary" size="lg" width="100%" onClick={reset} />
          </VStack>
        </Theme>
      </body>
    </html>
  );
}
