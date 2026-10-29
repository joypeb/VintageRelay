'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { CloseEventDialog } from '@/components/event/CloseEventDialog';
import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { EventShareCard } from '@/components/event/EventShareCard';
import { useCloseEventMutation, useEventQuery, useIsCloseEventPending } from '@/lib/api/events';
import { getCloseEventFailure, getEventScreenState, isClosed, isOrganizer } from '@/lib/event';
import { routes } from '@/lib/routes';
import { hasEventSession } from '@/lib/session';

const subscribe = () => () => {};

export function ManageEventScreen({ eventId }: { eventId: string }) {
  // localStorage is unavailable during SSR, so render nothing until the client has mounted.
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  // Astryx Heading doesn't forward refs or tabIndex, so a focusable wrapper receives focus.
  const headingRef = useRef<HTMLDivElement>(null);
  const closeMutation = useCloseEventMutation(eventId);
  const isClosePending = useIsCloseEventPending(eventId);
  const hasSession = isMounted && hasEventSession(eventId);
  const { data, error, isPending, isFetching, refetch } = useEventQuery(eventId, {
    enabled: hasSession,
  });

  // A server-confirmed closed event wins over a close failure only for the organizer (R5);
  // a non-organizer keeps the failure view so focus stays on the node that already holds it.
  const isEventClosed = data !== undefined && isOrganizer(data) && isClosed(data);
  const closeFailure =
    closeMutation.isError && !isEventClosed ? getCloseEventFailure(closeMutation.error) : null;
  const closeFailureKind = closeFailure?.kind ?? null;
  const isScreenLevelFailure =
    closeFailureKind === 'forbidden' ||
    closeFailureKind === 'no-access' ||
    closeFailureKind === 'not-found';
  const state = getEventScreenState({ hasSession, data, error, isPending });
  // Changes whenever the failure-driven view is replaced, so focus can follow it.
  const failureViewKey = state.kind === 'ready' ? `ready-${isOrganizer(state.event)}` : state.kind;
  const hasCloseActivity = isDialogOpen || closeMutation.isError || isClosePending;

  // Null until the event has loaded, so an event that is already closed never moves focus.
  const wasClosedRef = useRef<boolean | null>(null);
  // Raw wrapper for the same reason as the heading: Astryx components don't forward ref/tabIndex.
  const failureViewRef = useRef<HTMLDivElement>(null);
  const { reset: resetCloseMutation } = closeMutation;

  // H3 disappears without the success callback when the event closes elsewhere; keep focus on the page.
  useEffect(() => {
    if (data === undefined) return;
    // While our own close is in flight, reset() would detach the per-call onSuccess; defer until it settles.
    if (isClosePending) return;
    const wasClosed = wasClosedRef.current;
    wasClosedRef.current = isEventClosed;
    if (wasClosed !== false || !isEventClosed || !hasCloseActivity) return;
    setIsDialogOpen(false);
    resetCloseMutation();
    headingRef.current?.focus();
  }, [data, isEventClosed, hasCloseActivity, isClosePending, resetCloseMutation]);

  // The replacement view mounts because of a close failure, so focus would otherwise fall to <body>.
  useEffect(() => {
    if (isScreenLevelFailure) failureViewRef.current?.focus();
  }, [isScreenLevelFailure, closeFailureKind, failureViewKey]);

  if (!isMounted) return null;

  if (state.kind === 'loading') {
    return (
      // Astryx layout components don't forward aria attributes, so a minimal element marks the busy region.
      <section aria-busy="true" aria-label="Loading event">
        <VStack gap={4} padding={6}>
          <Skeleton width="60%" height={32} />
          <Skeleton width="70%" height={24} />
          <Skeleton height={224} />
          <Skeleton height={72} />
        </VStack>
      </section>
    );
  }

  // Every failure-driven view gets the focusable wrapper; the effect above refocuses when the view is replaced.
  const withFailureFocus = (node: ReactNode) =>
    isScreenLevelFailure ? (
      <div key={failureViewKey} ref={failureViewRef} tabIndex={-1}>
        {node}
      </div>
    ) : (
      node
    );

  if (state.kind === 'no-access' || state.kind === 'not-found') {
    return withFailureFocus(<EventScreenStatus kind={state.kind} />);
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

  const { event } = state;

  const closed = isClosed(event);

  if (!isOrganizer(event) || closeFailure?.kind === 'forbidden') {
    return withFailureFocus(
      <VStack gap={4} padding={6}>
        <Text type="body">Only the organizer can manage this event.</Text>
        <Button label="Back to home" variant="ghost" size="lg" href={routes.eventHome(eventId)} />
      </VStack>,
    );
  }

  if (closeFailure?.kind === 'no-access' || closeFailure?.kind === 'not-found') {
    return withFailureFocus(<EventScreenStatus kind={closeFailure.kind} />);
  }

  const openDialog = () => {
    closeMutation.reset();
    setIsDialogOpen(true);
  };

  const confirmClose = () => {
    closeMutation.mutate(undefined, {
      onSuccess: () => {
        setIsDialogOpen(false);
        setStatusMessage('Event closed');
        headingRef.current?.focus();
      },
    });
  };

  const counts = [
    ['Participants', event.stats?.participantCount],
    ['Available garments', event.stats?.availableClothingCount],
    ['Confirmed exchanges', event.stats?.confirmedExchangeCount],
  ] as const;

  return (
    <VStack gap={6} padding={6}>
      <VStack gap={2}>
        <div ref={headingRef} tabIndex={-1}>
          <Heading level={1}>Manage event</Heading>
        </div>
        <Badge label={closed ? 'Closed' : 'Active'} variant={closed ? 'neutral' : 'success'} />
        <Text type="body" color="secondary">
          {event.name}
        </Text>
      </VStack>
      <EventShareCard name={event.name} entryCode={event.entryCode} entryUrl={event.entryUrl} />
      <VStack gap={2}>
        {counts.map(([label, value]) => (
          <HStack key={label} gap={2} hAlign="between">
            <Text type="label">{label}</Text>
            <Text type="body">{value}</Text>
          </HStack>
        ))}
      </VStack>
      <VStack gap={3}>
        <Button
          label="Refresh"
          size="lg"
          width="100%"
          isLoading={isFetching}
          onClick={() => void refetch()}
        />
        {!closed && (
          <Button
            label="Close event"
            variant="destructive"
            size="lg"
            width="100%"
            isLoading={isClosePending}
            onClick={openDialog}
          />
        )}
        <Text type="body" color="secondary" as="p">
          {/* Always mounted so screen readers announce the text change; Text doesn't forward role. */}
          <span role="status" aria-live="polite">
            {statusMessage}
          </span>
        </Text>
        <Button label="Back to home" variant="ghost" size="lg" href={routes.eventHome(eventId)} />
      </VStack>
      <CloseEventDialog
        isOpen={isDialogOpen && !closed}
        onOpenChange={setIsDialogOpen}
        onConfirm={confirmClose}
        isPending={isClosePending}
        errorMessage={closeFailure?.kind === 'dialog' ? closeFailure.message : undefined}
      />
    </VStack>
  );
}
