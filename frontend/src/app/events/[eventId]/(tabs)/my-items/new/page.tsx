import { PhotoUploadScreen } from '@/components/clothing/PhotoUploadScreen';

export default async function NewItemPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <PhotoUploadScreen eventId={eventId} />;
}
