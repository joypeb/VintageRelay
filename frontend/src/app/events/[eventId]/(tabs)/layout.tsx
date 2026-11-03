import { HStack } from '@astryxdesign/core/HStack';
import { StackItem } from '@astryxdesign/core/Stack';

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
    <>
      {/* Hidden while the menu slot renders nothing, so non-organizers,
          closed events, and loading states get no empty header landmark. */}
      <HStack as="header" hAlign="end" className="empty:hidden">
        <EventHeaderMenuSlot eventId={eventId} />
      </HStack>
      {/* Grows to push the tab bar to the viewport bottom on short pages. */}
      <StackItem size="fill">{children}</StackItem>
      <BottomTabBar eventId={eventId} />
    </>
  );
}
