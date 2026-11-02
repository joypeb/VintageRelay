import { BottomTabBar } from '@/components/ui/BottomTabBar';

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
      {children}
      <BottomTabBar eventId={eventId} />
    </>
  );
}
