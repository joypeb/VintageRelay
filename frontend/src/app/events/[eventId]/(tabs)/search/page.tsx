import { Suspense } from 'react';

import { SearchScreen } from '@/components/search/SearchScreen';

export default async function SearchPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  // useSearchParams() in SearchScreen needs a Suspense boundary (Next.js docs:
  // "useSearchParams" always needs a <Suspense> boundary).
  return (
    <Suspense>
      <SearchScreen eventId={eventId} />
    </Suspense>
  );
}
