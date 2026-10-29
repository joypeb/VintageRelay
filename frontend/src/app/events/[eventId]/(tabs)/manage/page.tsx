import { ManageEventScreen } from '@/components/event/ManageEventScreen';

export default async function ManageEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <ManageEventScreen eventId={eventId} />;
}
