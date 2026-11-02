import { HStack } from '@astryxdesign/core/HStack';

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
      <HStack as="header" hAlign="end">
        <EventHeaderMenuSlot eventId={eventId} />
      </HStack>
      {children}
      <BottomTabBar eventId={eventId} />
    </>
  );
}
