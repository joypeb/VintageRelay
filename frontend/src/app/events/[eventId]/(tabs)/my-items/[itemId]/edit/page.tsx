import { EditClothingForm } from '@/components/clothing/EditClothingForm';

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ eventId: string; itemId: string }>;
}) {
  const { eventId, itemId } = await params;
  return <EditClothingForm eventId={eventId} clothingId={itemId} />;
}
