import { EventCreatedScreen } from '@/components/event/EventCreatedScreen';

export default async function EventCreatedPage({ params }: PageProps<'/events/[eventId]/created'>) {
  const { eventId } = await params;
  return <EventCreatedScreen eventId={eventId} />;
}
