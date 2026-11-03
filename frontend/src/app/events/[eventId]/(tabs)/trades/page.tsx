import { TradesOnboardScreen, type TradeTab } from '@/components/trade/TradesOnboardScreen';

const TABS: readonly TradeTab[] = ['received', 'sent', 'exchanges'];

function parseTab(value: string | string[] | undefined): TradeTab {
  return TABS.includes(value as TradeTab) ? (value as TradeTab) : 'received';
}

export default async function TradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { eventId } = await params;
  const { tab } = await searchParams;

  return <TradesOnboardScreen eventId={eventId} tab={parseTab(tab)} />;
}
