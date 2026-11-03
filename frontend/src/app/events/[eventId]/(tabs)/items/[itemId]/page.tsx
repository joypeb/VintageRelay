import { ClothingDetailScreen } from '@/components/clothing/ClothingDetailScreen';

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; itemId: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}) {
  const { eventId, itemId } = await params;
  const query = searchParams === undefined ? undefined : await searchParams;
  const raw = query?.from;
  const from = Array.isArray(raw) ? raw[0] : raw;
  return <ClothingDetailScreen eventId={eventId} clothingId={itemId} from={from} />;
}
