import { EventHomeScreen } from '@/components/event/EventHomeScreen';

export default async function EventHomePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventHomeScreen eventId={eventId} />;
}
