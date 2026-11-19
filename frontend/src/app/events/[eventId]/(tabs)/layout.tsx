import { HStack } from '@astryxdesign/core/HStack';
import { StackItem } from '@astryxdesign/core/Stack';
import { VStack } from '@astryxdesign/core/VStack';

import { BottomTabBar } from '@/components/ui/BottomTabBar';
import { EventHeaderMenuSlot } from '@/components/ui/EventHeaderMenu';

export default async function EventTabsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  return (
    <VStack height="100%" gap={0}>
      {/* Hidden while the menu slot renders nothing, so non-organizers,
          closed events, and loading states get no empty header landmark. */}
      <HStack as="header" hAlign="end" className="empty:hidden">
        <EventHeaderMenuSlot eventId={eventId} />
      </HStack>
      <StackItem size="fill" isScrollable as="main">
        {children}
      </StackItem>
      <BottomTabBar eventId={eventId} />
    </VStack>
  );
}
