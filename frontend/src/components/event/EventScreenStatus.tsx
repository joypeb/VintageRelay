import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { routes } from '@/lib/routes';

type EventScreenStatusProps =
  | { kind: 'no-access' | 'not-found' }
  | { kind: 'error'; message: string; onRetry: () => void; isLoading: boolean };

export function EventScreenStatus(props: EventScreenStatusProps) {
  if (props.kind === 'error') {
    return (
      <VStack gap={4} padding={6}>
        {/* Banner doesn't create a live region, so a wrapper announces the error. */}
        <div role="alert">
          <Banner status="error" title={props.message} />
        </div>
        <Button
          label="Try again"
          size="lg"
          width="100%"
          isLoading={props.isLoading}
          onClick={props.onRetry}
        />
      </VStack>
    );
  }

  const noAccess = props.kind === 'no-access';

  return (
    <VStack gap={4} padding={6}>
      <Text type="body">
        {noAccess
          ? "You haven't joined this event on this device."
          : 'This event could not be found.'}
      </Text>
      {noAccess && (
        <Button
          label="Join with entry code"
          variant="primary"
          size="lg"
          width="100%"
          href={routes.join()}
        />
      )}
      <Button
        label="Go to start"
        variant={noAccess ? 'ghost' : 'primary'}
        size="lg"
        width="100%"
        href={routes.landing()}
      />
    </VStack>
  );
}
