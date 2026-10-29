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
    <>
      <EventClosedBanner eventId={eventId} />
      {children}
    </>
  );
}
