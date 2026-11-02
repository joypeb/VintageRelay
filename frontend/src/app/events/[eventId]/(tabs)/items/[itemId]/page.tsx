import { ClothingDetailScreen } from '@/components/clothing/ClothingDetailScreen';

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ eventId: string; itemId: string }>;
}) {
  const { eventId, itemId } = await params;
  return <ClothingDetailScreen eventId={eventId} clothingId={itemId} />;
}
