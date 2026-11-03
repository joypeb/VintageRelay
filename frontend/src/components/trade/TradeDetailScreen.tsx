'use client';

import { useSyncExternalStore } from 'react';

import { Skeleton } from '@astryxdesign/core/Skeleton';
import { VStack } from '@astryxdesign/core/VStack';

import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { ProposalDetail } from '@/components/trade/ProposalDetail';
import { useEventQuery } from '@/lib/api/events';
import { getEventScreenState } from '@/lib/event';
import { hasEventSession } from '@/lib/session';

const subscribe = () => () => {};

export function TradeDetailScreen({ eventId, tradeId }: { eventId: string; tradeId: string }) {
  const isMounted = useSyncExternalStore(subscribe, () => true, () => false);
  const hasSession = isMounted && hasEventSession(eventId);
  const { data, error, isPending, isFetching, refetch } = useEventQuery(eventId, {
    enabled: hasSession,
  });

  if (!isMounted) return null;

  const state = getEventScreenState({ hasSession, data, error, isPending });
  if (state.kind === 'loading') {
    return (
      <section aria-busy="true" aria-label="Loading trade">
        <VStack gap={4} padding={6}>
          <Skeleton width="70%" height={32} />
          <Skeleton width="30%" height={24} />
          <Skeleton height={72} />
        </VStack>
      </section>
    );
  }
  if (state.kind === 'no-access' || state.kind === 'not-found') {
    return <EventScreenStatus kind={state.kind} />;
  }
  if (state.kind === 'error') {
    return (
      <EventScreenStatus
        kind="error"
        message={state.message}
        isLoading={isFetching}
        onRetry={() => void refetch()}
      />
    );
  }
  return <ProposalDetail eventId={eventId} proposalId={tradeId} eventStatus={state.event.status} />;
}
