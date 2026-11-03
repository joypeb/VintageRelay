'use client';

import { useSyncExternalStore } from 'react';

import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { VStack } from '@astryxdesign/core/VStack';

import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { useEventQuery } from '@/lib/api/events';
import { getEventScreenState, isClosed } from '@/lib/event';
import { routes } from '@/lib/routes';
import { hasEventSession } from '@/lib/session';

export type TradeTab = 'received' | 'sent' | 'exchanges';

type TabCopy = {
  label: string;
  panelLabel: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: (eventId: string) => string;
};

const TAB_COPY: Record<TradeTab, TabCopy> = {
  received: {
    label: 'Received',
    panelLabel: 'Received requests',
    title: 'No requests yet',
    description:
      'Requests arrive here when another participant picks one of your items and offers one of theirs. Each exchange is 1-for-1: you give one item and receive one. Nothing is confirmed until every participant consents.',
    ctaLabel: 'Register item',
    ctaHref: routes.newItem,
  },
  sent: {
    label: 'Sent',
    panelLabel: 'Sent requests',
    title: 'No sent requests yet',
    description:
      'Browse clothes and send a request by offering one of your items. Each exchange is 1-for-1 and needs every participant’s consent before it is confirmed.',
    ctaLabel: 'Browse clothes',
    ctaHref: routes.search,
  },
  exchanges: {
    label: 'Exchanges',
    panelLabel: 'Exchanges',
    title: 'No exchanges yet',
    description:
      'Accepted requests become proposals here. An exchange is confirmed only when every participant consents. Consent is not handover — hand items over in person at the event.',
    ctaLabel: 'Register item',
    ctaHref: routes.newItem,
  },
};

const subscribe = () => () => {};

export function TradesOnboardScreen({ eventId, tab }: { eventId: string; tab: TradeTab }) {
  // localStorage is unavailable during SSR, so read the session only after mount.
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const hasSession = isMounted && hasEventSession(eventId);
  const { data, error, isPending, isFetching, refetch } = useEventQuery(eventId, {
    enabled: hasSession,
  });

  if (!isMounted) return null;

  const state = getEventScreenState({ hasSession, data, error, isPending });

  if (state.kind === 'loading') {
    return (
      // Astryx layout components don't forward aria attributes, so a minimal element marks the busy region.
      <section aria-busy="true" aria-label="Loading trades">
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

  const closed = isClosed(state.event);

  const copy = TAB_COPY[tab];
  const tabHref = (value: TradeTab) => `${routes.trades(eventId)}?tab=${value}`;

  return (
    <VStack gap={4} padding={6}>
      {/* Link navigation drives the selected value from the ?tab= query param.
          Tabs render as anchors, so selection never fires onChange and the noop is safe. */}
      <TabList value={tab} onChange={() => undefined} layout="fill" size="lg">
        <Tab value="received" label="Received" href={tabHref('received')} />
        <Tab value="sent" label="Sent" href={tabHref('sent')} />
        <Tab value="exchanges" label="Exchanges" href={tabHref('exchanges')} />
      </TabList>
      {closed && (
        <Banner
          status="warning"
          title="This event has ended."
          description="Trades are read-only."
        />
      )}
      {/* Astryx layout components don't forward aria attributes, so a minimal element labels the panel. */}
      <section aria-label={copy.panelLabel}>
        <EmptyState
          title={copy.title}
          description={copy.description}
          headingLevel={1}
          actions={
            closed ? undefined : (
              <Button label={copy.ctaLabel} size="lg" href={copy.ctaHref(eventId)} />
            )
          }
        />
      </section>
    </VStack>
  );
}
