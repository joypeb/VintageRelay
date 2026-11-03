import { TradeDetailScreen } from '@/components/trade/TradeDetailScreen';

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ eventId: string; tradeId: string }>;
}) {
  const { eventId, tradeId } = await params;
  return <TradeDetailScreen eventId={eventId} tradeId={tradeId} />;
}
