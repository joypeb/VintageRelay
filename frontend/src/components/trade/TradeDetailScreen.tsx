'use client';

import { useSyncExternalStore } from 'react';

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
      <VStack gap={4} padding={6}>
        <EventScreenStatus kind="error" message="Loading…" isLoading={isFetching} onRetry={() => void refetch()} />
      </VStack>
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
