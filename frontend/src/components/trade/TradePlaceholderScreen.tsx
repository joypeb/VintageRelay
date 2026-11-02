import { EmptyState } from '@astryxdesign/core/EmptyState';

export function TradePlaceholderScreen() {
  return (
    <EmptyState
      title="Coming soon"
      description="Trade requests and exchanges are not available yet."
      headingLevel={1}
    />
  );
}
