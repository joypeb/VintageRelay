import { JoinEventScreen } from '@/components/event/JoinEventScreen';
import { readInitialCode } from '@/lib/validation/join';

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { code } = await searchParams;
  return <JoinEventScreen initialCode={readInitialCode(code)} />;
}
