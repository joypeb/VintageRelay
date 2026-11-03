import { VStack } from '@astryxdesign/core/VStack';

import { EventClosedBanner } from '@/components/event/EventClosedBanner';

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  return (
    // Full-viewport-height column so the tab bar ends at the viewport bottom on short pages.
    <VStack minHeight="100dvh" gap={0}>
      <EventClosedBanner eventId={eventId} />
      {children}
    </VStack>
  );
}
