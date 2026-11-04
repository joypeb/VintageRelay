'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { Link } from '@astryxdesign/core/Link';
import { List, ListItem } from '@astryxdesign/core/List';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';
import { getFormErrorMessage } from '@/lib/api/error-messages';
import { consentProposal, cancelProposal, getProposal, rejectProposal } from '@/lib/api/proposals';
import { queryKeys } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { proposalStatusLabel, responseLabel, toHandoverRows } from '@/lib/trades';
import { formatDateTime } from '@/lib/utils/date';
import { CATEGORY_OPTIONS } from '@/lib/validation/clothing-form';

const subscribe = () => () => {};

type ConfirmKind = 'consent' | 'reject';

type VersionConflict = {
  currentStatus: string;
  latestProposalId: string | null;
};

// Same shape as getProposalConflict in lib/api/proposals (inlined so the
// existing unit mocks for getProposal/consent/reject keep working).
function toVersionConflict(error: unknown): VersionConflict | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code !== 'PROPOSAL_VERSION_MISMATCH') return null;
  const details = error.details as
    | { currentStatus?: unknown; latestProposalId?: unknown }
    | null
    | undefined;
  if (typeof details !== 'object' || details === null) return null;
  if (typeof details.currentStatus !== 'string') return null;
  const latestProposalId =
    typeof details.latestProposalId === 'string' ? details.latestProposalId : null;
  return { currentStatus: details.currentStatus, latestProposalId };
}

export function ProposalDetail({
  eventId,
  proposalId,
  eventStatus,
}: {
  eventId: string;
  proposalId: string;
  eventStatus: 'active' | 'closed';
}) {
  const isMounted = useSyncExternalStore(subscribe, () => true, () => false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.proposal(eventId, proposalId),
    queryFn: () => getProposal(eventId, proposalId),
    enabled: isMounted,
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      if (eventStatus === 'closed') return false;
      const status = q.state.data?.status;
      if (status === 'pending') return 5_000;
      if (status === 'confirmed') return 10_000;
      return false;
    },
    refetchIntervalInBackground: false,
  });
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [conflict, setConflict] = useState<VersionConflict | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [displayedVersion, setDisplayedVersion] = useState<number | null>(null);

  const data = query.data;

  // Pin the first version loaded so consent sends the reviewed version.
  useEffect(() => {
    if (data !== undefined && displayedVersion === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pin async loaded version once
      setDisplayedVersion(data.version);
    }
  }, [data, displayedVersion]);

  const consentMutation = useMutation({
    mutationFn: (version: number) => consentProposal(eventId, proposalId, version),
    retry: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
  });
  const rejectMutation = useMutation({
    mutationFn: (version: number) => rejectProposal(eventId, proposalId, version),
    retry: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelProposal(eventId, proposalId),
    retry: 0,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
  });

  if (!isMounted) return null;

  if (query.isPending) {
    return (
      <section aria-label="Loading proposal" aria-busy="true">
        <VStack gap={4} padding={6}>
          <Skeleton width="40%" height={24} />
          <Skeleton height={72} />
        </VStack>
      </section>
    );
  }

  if (query.error || !data) {
    return (
      <VStack gap={4} padding={6}>
        <Text type="body" as="p">
          <span role="alert">{getFormErrorMessage(query.error)}</span>
        </Text>
        <Button label="Reload" size="lg" width="100%" onClick={() => void query.refetch()} />
      </VStack>
    );
  }

  const versionChanged = displayedVersion !== null && data.version !== displayedVersion;
  const closed = eventStatus === 'closed';
  const terminal = data.status !== 'pending';
  const isHandover = data.status === 'confirmed' || data.status === 'cancelled';
  const isCancelled = data.status === 'cancelled';
  const isEnded = terminal && !isHandover;
  const showCancelButton = data.status === 'confirmed' && data.canCancel && !closed;
  const anyPending = consentMutation.isPending || rejectMutation.isPending;
  const consentDisabled =
    closed || terminal || !data.canConsent || versionChanged || anyPending || conflict !== null;
  const rejectDisabled =
    closed || terminal || !data.canReject || versionChanged || anyPending || conflict !== null;

  async function handleConfirm(kind: ConfirmKind) {
    if (displayedVersion === null) return;
    setActionError(null);
    try {
      if (kind === 'consent') {
        await consentMutation.mutateAsync(displayedVersion);
      } else {
        await rejectMutation.mutateAsync(displayedVersion);
      }
      setConfirmKind(null);
      await query.refetch();
    } catch (err) {
      const versionConflict = toVersionConflict(err);
      if (versionConflict !== null) {
        setConfirmKind(null);
        setConflict(versionConflict);
      } else {
        setActionError(getFormErrorMessage(err));
      }
    }
  }

  function handleReviewLatest() {
    if (!data) return;
    setDisplayedVersion(data.version);
    setConflict(null);
  }

  async function handleConflictAcknowledge() {
    setConflict(null);
    const result = await query.refetch();
    if (result.data) {
      setDisplayedVersion(result.data.version);
    } else if (query.data) {
      setDisplayedVersion(query.data.version);
    }
  }

  async function handleCancelConfirm() {
    setActionError(null);
    try {
      await cancelMutation.mutateAsync();
      setShowCancel(false);
      router.push(routes.trades(eventId));
    } catch (err) {
      setShowCancel(false);
      setActionError(getFormErrorMessage(err));
    }
  }

  return (
    <VStack gap={4} padding={6}>
      <Heading level={1}>{isCancelled ? 'Exchange cancelled' : isHandover ? 'Exchange confirmed' : isEnded ? 'Exchange ended' : 'Exchange proposal'}</Heading>
      <Link
        href={`${routes.trades(eventId)}?tab=exchanges`}
        isStandalone
        className="inline-flex min-h-11 items-center"
      >
        Back to Exchanges
      </Link>
      {closed ? (
        <Banner status="warning" title="This event has ended." description="Trades are read-only." />
      ) : null}
      {isHandover || isEnded ? null : (
        <Text type="body">
          {data.version === 1 ? proposalStatusLabel(data) : `Version ${data.version} · ${proposalStatusLabel(data)}`}
        </Text>
      )}
      {isEnded ? <Banner status="info" title={proposalStatusLabel(data)} /> : null}
      {!isHandover && versionChanged ? (
        <VStack gap={2}>
          <Banner
            status="warning"
            title="The proposal has changed."
            description="Review the latest version before acting."
          />
          <Button label="Review latest" size="lg" width="100%" onClick={handleReviewLatest} />
        </VStack>
      ) : null}
      {actionError !== null ? (
        <Text type="body" as="p">
          <span role="alert">{actionError}</span>
        </Text>
      ) : null}
      {isHandover ? (
        <>
          {isCancelled ? (
            <Banner
              status="info"
              title="This exchange was cancelled."
              description={data.cancelledAt ? `Cancelled at ${formatDateTime(data.cancelledAt)}` : undefined}
            />
          ) : (
            <Banner
              status="success"
              title="Confirmed."
              description="Inspect the garments in person before handing them over."
            />
          )}
          {data.confirmedAt !== null ? (
            <Text type="body">{`Confirmed at ${formatDateTime(data.confirmedAt)}`}</Text>
          ) : null}
          <List header={<Heading level={2}>Who gives and receives</Heading>} hasDividers>
            {toHandoverRows(data.participants).map((row) => {
              const givesLabel =
                CATEGORY_OPTIONS.find((option) => option.value === row.gives.category)?.label ??
                row.gives.category;
              const receivesLabel =
                CATEGORY_OPTIONS.find((option) => option.value === row.receives.category)?.label ??
                row.receives.category;
              return (
                <ListItem
                  key={row.gives.id}
                  isSelected={row.isMe}
                  aria-current={row.isMe ? true : undefined}
                  label={
                    <>
                      {row.isMe ? 'You give ' : `${row.name} gives `}
                      <Link
                        href={routes.itemDetail(eventId, row.gives.id)}
                        isStandalone
                        className="inline-flex min-h-11 items-center"
                      >
                        {row.gives.photoUrl !== '' ? (
                          <img
                            src={row.gives.photoUrl}
                            alt=""
                            className="h-12 w-12 object-cover"
                          />
                        ) : null}
                        {`${row.gives.title} · ${givesLabel}`}
                      </Link>
                      {` to ${row.givesTo}`}
                    </>
                  }
                  description={
                    <>
                      {row.isMe ? 'You receive ' : `${row.name} receives `}
                      <Link
                        href={routes.itemDetail(eventId, row.receives.id)}
                        isStandalone
                        className="inline-flex min-h-11 items-center"
                      >
                        {row.receives.photoUrl !== '' ? (
                          <img
                            src={row.receives.photoUrl}
                            alt=""
                            className="h-12 w-12 object-cover"
                          />
                        ) : null}
                        {`${row.receives.title} · ${receivesLabel}`}
                      </Link>
                      {` from ${row.receivesFrom}`}
                    </>
                  }
                />
              );
            })}
          </List>
          {showCancelButton ? (
            <Button
              label="Cancel exchange"
              variant="destructive"
              size="lg"
              width="100%"
              onClick={() => setShowCancel(true)}
            />
          ) : null}
        </>
      ) : isEnded ? (
        <List header={<Heading level={2}>Who gives and receives</Heading>} hasDividers>
          {data.participants.map((participant) => (
            <ListItem
              key={participant.participant.participantId}
              label={`${participant.participant.displayName} gives ${participant.offeredClothing.title}`}
              description={`Receives ${participant.receivedClothing.title}`}
            />
          ))}
        </List>
      ) : (
        <>
          <List header={<Heading level={2}>Who gives and receives</Heading>} hasDividers>
            {data.participants.map((participant) => (
              <ListItem
                key={participant.participant.participantId}
                label={`${participant.participant.displayName} gives ${participant.offeredClothing.title}`}
                description={`Receives ${participant.receivedClothing.title} · ${responseLabel(participant.response)}`}
              />
            ))}
          </List>
          <Text type="body">{`Your response: ${responseLabel(data.myResponse)}`}</Text>
          {data.myResponse === 'consented' ? null : (
            <Button
              label="Consent"
              size="lg"
              width="100%"
              isDisabled={consentDisabled}
              isLoading={consentMutation.isPending}
              onClick={() => setConfirmKind('consent')}
            />
          )}
          <Button
            label="Reject"
            variant="secondary"
            size="lg"
            width="100%"
            isDisabled={rejectDisabled}
            isLoading={rejectMutation.isPending}
            onClick={() => setConfirmKind('reject')}
          />
        </>
      )}
      <Dialog
        isOpen={showCancel}
        onOpenChange={(open) => {
          if (!open && !cancelMutation.isPending) setShowCancel(false);
        }}
        purpose="info"
      >
        <DialogHeader title="Cancel this exchange?" />
        <VStack gap={4} padding={6}>
          <Text type="body">
            The whole exchange is cancelled for every participant, and all its garments become
            available again.
          </Text>
          <Button
            label="Cancel exchange"
            variant="destructive"
            size="lg"
            width="100%"
            isLoading={cancelMutation.isPending}
            isDisabled={cancelMutation.isPending}
            onClick={() => void handleCancelConfirm()}
          />
          <Button
            label="Keep exchange"
            variant="ghost"
            size="lg"
            width="100%"
            isDisabled={cancelMutation.isPending}
            onClick={() => setShowCancel(false)}
          />
        </VStack>
      </Dialog>
      <Dialog
        isOpen={confirmKind !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmKind(null);
        }}
        purpose="info"
      >
        <DialogHeader title={confirmKind === 'reject' ? 'Reject this proposal?' : 'Consent to this proposal?'} />
        <VStack gap={4} padding={6}>
          <Text type="body">{`You reviewed version ${displayedVersion ?? data.version}. This action applies to that version only.`}</Text>
          <Button
            label={confirmKind === 'reject' ? 'Reject' : 'Consent'}
            variant={confirmKind === 'reject' ? 'secondary' : 'primary'}
            size="lg"
            width="100%"
            isLoading={anyPending}
            isDisabled={anyPending}
            onClick={() => void handleConfirm(confirmKind ?? 'consent')}
          />
          <Button
            label="Cancel"
            variant="ghost"
            size="lg"
            width="100%"
            onClick={() => setConfirmKind(null)}
          />
        </VStack>
      </Dialog>
      <Dialog
        isOpen={conflict !== null}
        onOpenChange={(open) => {
          if (!open) void handleConflictAcknowledge();
        }}
        purpose="info"
      >
        {conflict !== null ? (
          <>
            <DialogHeader title="The proposal has changed." />
            <VStack gap={4} padding={6}>
              <Text type="body">{`Current status: ${proposalStatusLabel({ status: conflict.currentStatus, endReason: null, endDetail: null })}. Review the latest version before acting.`}</Text>
              {conflict.latestProposalId ? (
                <Link
                  href={routes.tradeDetail(eventId, conflict.latestProposalId)}
                  isStandalone
                  className="inline-flex min-h-11 min-w-11 items-center"
                >
                  View latest proposal
                </Link>
              ) : null}
              <Button
                label="Reload"
                size="lg"
                width="100%"
                onClick={() => void handleConflictAcknowledge()}
              />
            </VStack>
          </>
        ) : null}
      </Dialog>
    </VStack>
  );
}
