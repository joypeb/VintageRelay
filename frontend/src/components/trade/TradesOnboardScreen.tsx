'use client';

import { useState, useSyncExternalStore } from 'react';

import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { List, ListItem } from '@astryxdesign/core/List';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { getFormErrorMessage } from '@/lib/api/error-messages';
import { useEventQuery } from '@/lib/api/events';
import {
  useAcceptIntentMutation,
  useDeclineIntentMutation,
  useIntentsQuery,
  useWithdrawIntentMutation,
} from '@/lib/api/intents';
import { useProposalsQuery } from '@/lib/api/proposals';
import { getEventScreenState, isClosed } from '@/lib/event';
import { routes } from '@/lib/routes';
import { hasEventSession } from '@/lib/session';
import {
  groupProposals,
  intentStatusLabel,
  isReceivedActionable,
  isSentActionable,
  pendingParticipantNames,
  proposalStatusLabel,
  requestStageItems,
  responseLabel,
} from '@/lib/trades';
import type { Intent } from '@/types/intent';
import type { Proposal } from '@/types/proposal';

export type TradeTab = 'received' | 'sent' | 'exchanges';

const TABS: TradeTab[] = ['received', 'sent', 'exchanges'];

function ReceivedRow({
  eventId,
  intent,
  proposals,
  closed,
}: {
  eventId: string;
  intent: Intent;
  proposals: Proposal[];
  closed: boolean;
}) {
  const accept = useAcceptIntentMutation(eventId, intent.id);
  const decline = useDeclineIntentMutation(eventId, intent.id);
  const [error, setError] = useState<string | null>(null);
  const actionable = isReceivedActionable(intent, proposals, closed);

  async function handleAccept() {
    setError(null);
    try {
      await accept.mutateAsync();
    } catch (err) {
      setError(getFormErrorMessage(err));
    }
  }

  async function handleDecline() {
    setError(null);
    try {
      await decline.mutateAsync();
    } catch (err) {
      setError(getFormErrorMessage(err));
    }
  }

  return (
    <VStack gap={2}>
      <ListItem
        label={`${intent.offeredClothing.title} for ${intent.wantedClothing.title}`}
        description={`${intent.offeredClothing.owner.displayName} offers · ${intentStatusLabel(intent, proposals)}`}
      />
      {error !== null ? (
        <Text type="body" as="p">
          <span role="alert">{error}</span>
        </Text>
      ) : null}
      {actionable ? (
        <VStack gap={2}>
          <Button
            label="Accept"
            size="md"
            width="100%"
            isLoading={accept.isPending}
            isDisabled={accept.isPending || decline.isPending}
            onClick={() => void handleAccept()}
          />
          <Button
            label="Decline"
            variant="destructive"
            size="md"
            width="100%"
            isLoading={decline.isPending}
            isDisabled={accept.isPending || decline.isPending}
            onClick={() => void handleDecline()}
          />
        </VStack>
      ) : null}
    </VStack>
  );
}

function SentRow({
  eventId,
  intent,
  proposals,
  closed,
}: {
  eventId: string;
  intent: Intent;
  proposals: Proposal[];
  closed: boolean;
}) {
  const withdraw = useWithdrawIntentMutation(eventId, intent.id);
  const [error, setError] = useState<string | null>(null);
  const actionable = isSentActionable(intent, closed);

  async function handleWithdraw() {
    setError(null);
    try {
      await withdraw.mutateAsync();
    } catch (err) {
      setError(getFormErrorMessage(err));
    }
  }

  return (
    <VStack gap={2}>
      <ListItem
        label={`${intent.offeredClothing.title} for ${intent.wantedClothing.title}`}
        description={intentStatusLabel(intent, proposals)}
      />
      {error !== null ? (
        <Text type="body" as="p">
          <span role="alert">{error}</span>
        </Text>
      ) : null}
      {actionable ? (
        <Button
          label={withdraw.isPending ? 'Withdrawing…' : 'Withdraw'}
          size="md"
          width="100%"
          isLoading={withdraw.isPending}
          isDisabled={withdraw.isPending}
          onClick={() => void handleWithdraw()}
        />
      ) : null}
    </VStack>
  );
}

function ProposalRow({
  eventId,
  proposal,
  waitingFor,
}: {
  eventId: string;
  proposal: Proposal;
  waitingFor?: string[];
}) {
  const summary = proposal.participants
    .map((p) => `${p.participant.displayName} gives ${p.offeredClothing.title}`)
    .join(' · ');
  const waiting =
    waitingFor !== undefined && waitingFor.length > 0
      ? ` · Waiting for ${waitingFor.join(', ')}`
      : '';
  return (
    <ListItem
      label={`Version ${proposal.version} · ${proposalStatusLabel(proposal)}`}
      description={`${summary} · Your response: ${responseLabel(proposal.myResponse)}${waiting}`}
      href={routes.tradeDetail(eventId, proposal.id)}
    />
  );
}

const subscribe = () => () => {};

export function TradesOnboardScreen({ eventId, tab }: { eventId: string; tab: TradeTab }) {
  const isMounted = useSyncExternalStore(subscribe, () => true, () => false);
  const hasSession = isMounted && hasEventSession(eventId);
  const eventQuery = useEventQuery(eventId, { enabled: hasSession });
  const eventClosed = eventQuery.data?.status === 'closed';
  const receivedQuery = useIntentsQuery(eventId, {
    direction: 'received',
    status: ['active', 'declined', 'withdrawn', 'invalidated'],
    enabled: hasSession,
    closed: eventClosed,
  });
  const sentQuery = useIntentsQuery(eventId, {
    direction: 'sent',
    status: ['active', 'declined', 'withdrawn', 'invalidated'],
    enabled: hasSession,
    closed: eventClosed,
  });
  const proposalsQuery = useProposalsQuery(eventId, { enabled: hasSession, closed: eventClosed });

  if (!isMounted) return null;

  const state = getEventScreenState({
    hasSession,
    data: eventQuery.data,
    error: eventQuery.error,
    isPending: eventQuery.isPending,
  });

  if (state.kind === 'loading') {
    return (
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
        isLoading={eventQuery.isFetching}
        onRetry={() => void eventQuery.refetch()}
      />
    );
  }

  const closed = isClosed(state.event);
  const tabHref = (value: TradeTab) => `${routes.trades(eventId)}?tab=${value}`;

  function renderPanel() {
    if (tab === 'received') {
      if (receivedQuery.isPending || proposalsQuery.isPending) {
        return <Text type="body">Loading requests…</Text>;
      }
      const requestsError = receivedQuery.error ?? proposalsQuery.error;
      if (requestsError) {
        return (
          <VStack gap={2}>
            <Text type="body" as="p">
              <span role="alert">{getFormErrorMessage(requestsError)}</span>
            </Text>
            <Button
              label="Retry"
              size="lg"
              width="100%"
              onClick={() => {
                if (receivedQuery.error) void receivedQuery.refetch();
                if (proposalsQuery.error) void proposalsQuery.refetch();
              }}
            />
          </VStack>
        );
      }
      const items = receivedQuery.data?.items ?? [];
      if (items.length === 0) {
        return (
          <EmptyState
            title="No requests yet"
            description="Requests arrive here when another participant picks one of your items and offers one of theirs. Each exchange is 1-for-1: you give one item and receive one. Nothing is confirmed until every participant consents."
            headingLevel={1}
            actions={closed ? undefined : <Button label="Register item" size="lg" href={routes.newItem(eventId)} />}
          />
        );
      }
      return (
        <List header={<Heading level={2}>Received requests</Heading>} hasDividers>
          {items.map((intent) => (
            <ReceivedRow
              key={intent.id}
              eventId={eventId}
              intent={intent}
              proposals={proposalsQuery.data?.items ?? []}
              closed={closed}
            />
          ))}
        </List>
      );
    }
    if (tab === 'sent') {
      if (sentQuery.isPending || proposalsQuery.isPending) {
        return <Text type="body">Loading requests…</Text>;
      }
      const requestsError = sentQuery.error ?? proposalsQuery.error;
      if (requestsError) {
        return (
          <VStack gap={2}>
            <Text type="body" as="p">
              <span role="alert">{getFormErrorMessage(requestsError)}</span>
            </Text>
            <Button
              label="Retry"
              size="lg"
              width="100%"
              onClick={() => {
                if (sentQuery.error) void sentQuery.refetch();
                if (proposalsQuery.error) void proposalsQuery.refetch();
              }}
            />
          </VStack>
        );
      }
      const items = sentQuery.data?.items ?? [];
      if (items.length === 0) {
        return (
          <EmptyState
            title="No sent requests yet"
            description="Browse clothes and send a request by offering one of your items. Each exchange is 1-for-1 and needs every participant’s consent before it is confirmed."
            headingLevel={1}
            actions={closed ? undefined : <Button label="Browse clothes" size="lg" href={routes.search(eventId)} />}
          />
        );
      }
      return (
        <List header={<Heading level={2}>Sent requests</Heading>} hasDividers>
          {items.map((intent) => (
            <SentRow
              key={intent.id}
              eventId={eventId}
              intent={intent}
              proposals={proposalsQuery.data?.items ?? []}
              closed={closed}
            />
          ))}
        </List>
      );
    }
    const exchangesPending =
      receivedQuery.isPending || sentQuery.isPending || proposalsQuery.isPending;
    if (exchangesPending) return <Text type="body">Loading exchanges…</Text>;
    const exchangesError =
      receivedQuery.error ?? sentQuery.error ?? proposalsQuery.error;
    if (exchangesError) {
      return (
        <VStack gap={2}>
          <Text type="body" as="p">
            <span role="alert">{getFormErrorMessage(exchangesError)}</span>
          </Text>
          <Button
            label="Retry"
            size="lg"
            width="100%"
            onClick={() => {
              void receivedQuery.refetch();
              void sentQuery.refetch();
              void proposalsQuery.refetch();
            }}
          />
        </VStack>
      );
    }
    const requests = requestStageItems(
      sentQuery.data?.items ?? [],
      receivedQuery.data?.items ?? [],
      proposalsQuery.data?.items ?? [],
    );
    const grouped = groupProposals(proposalsQuery.data?.items ?? []);
    const total =
      requests.length +
      grouped.awaitingMyConsent.length +
      grouped.waitingForOthers.length +
      grouped.confirmed.length +
      grouped.history.length;
    if (total === 0) {
      return (
        <EmptyState
          title="No exchanges yet"
          description="Accepted requests become proposals here. An exchange is confirmed only when every participant consents. Consent is not handover — hand items over in person at the event."
          headingLevel={1}
          actions={closed ? undefined : <Button label="Register item" size="lg" href={routes.newItem(eventId)} />}
        />
      );
    }
    return (
      <VStack gap={4}>
        {requests.length > 0 ? (
          <List header={<Heading level={2}>Requests</Heading>} hasDividers>
            {requests.map(({ intent, direction }) => (
              <ListItem
                key={intent.id}
                label={`${intent.offeredClothing.title} for ${intent.wantedClothing.title}`}
                description={
                  direction === 'sent'
                    ? `Waiting for ${intent.wantedClothing.owner.displayName} to answer`
                    : 'Waiting for your answer'
                }
                href={tabHref(direction)}
              />
            ))}
          </List>
        ) : null}
        {grouped.awaitingMyConsent.length > 0 ? (
          <List header={<Heading level={2}>Awaiting my consent</Heading>} hasDividers>
            {grouped.awaitingMyConsent.map((proposal) => (
              <ProposalRow key={proposal.id} eventId={eventId} proposal={proposal} />
            ))}
          </List>
        ) : null}
        {grouped.waitingForOthers.length > 0 ? (
          <List header={<Heading level={2}>Waiting for others</Heading>} hasDividers>
            {grouped.waitingForOthers.map((proposal) => (
              <ProposalRow
                key={proposal.id}
                eventId={eventId}
                proposal={proposal}
                waitingFor={pendingParticipantNames(proposal)}
              />
            ))}
          </List>
        ) : null}
        {grouped.confirmed.length > 0 ? (
          <List header={<Heading level={2}>Confirmed</Heading>} hasDividers>
            {grouped.confirmed.map((proposal) => (
              <ProposalRow key={proposal.id} eventId={eventId} proposal={proposal} />
            ))}
          </List>
        ) : null}
        {grouped.history.length > 0 ? (
          <List header={<Heading level={2}>History</Heading>} hasDividers>
            {grouped.history.map((proposal) => (
              <ProposalRow key={proposal.id} eventId={eventId} proposal={proposal} />
            ))}
          </List>
        ) : null}
      </VStack>
    );
  }

  return (
    <VStack gap={4} padding={6}>
      <TabList value={tab} onChange={() => undefined} layout="fill" size="lg">
        {TABS.map((value) => (
          <Tab key={value} value={value} label={value === 'exchanges' ? 'Exchanges' : value === 'received' ? 'Received' : 'Sent'} href={tabHref(value)} />
        ))}
      </TabList>
      {closed && (
        <Banner status="warning" title="This event has ended." description="Trades are read-only." />
      )}
      <section aria-label={tab === 'received' ? 'Received requests' : tab === 'sent' ? 'Sent requests' : 'Exchanges'}>
        {renderPanel()}
      </section>
    </VStack>
  );
}
