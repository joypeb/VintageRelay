import { MyItemsList } from '@/components/clothing/MyItemsList';

export default async function MyItemsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <MyItemsList eventId={eventId} />;
}
