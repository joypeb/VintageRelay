import { MyItemsPlaceholderScreen } from '@/components/clothing/MyItemsPlaceholderScreen';

export default async function MyItemsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <MyItemsPlaceholderScreen eventId={eventId} />;
}
