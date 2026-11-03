import { MyItemDetailScreen } from '@/components/clothing/MyItemDetailScreen';

export default async function MyItemDetailPage({
  params,
}: {
  params: Promise<{ eventId: string; itemId: string }>;
}) {
  const { eventId, itemId } = await params;
  return <MyItemDetailScreen eventId={eventId} clothingId={itemId} />;
}
