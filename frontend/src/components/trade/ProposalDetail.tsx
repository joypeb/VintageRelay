'use client';

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
import { consentProposal, getProposal, rejectProposal } from '@/lib/api/proposals';
import { queryKeys } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';

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
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.proposal(eventId, proposalId),
    queryFn: () => getProposal(eventId, proposalId),
    enabled: isMounted,
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (q) =>
      eventStatus === 'closed' ? false : q.state.data?.status === 'pending' ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
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

  return (
    <VStack gap={4} padding={6}>
      <Heading level={1}>Exchange proposal</Heading>
      {closed ? (
        <Banner status="warning" title="This event has ended." description="Trades are read-only." />
      ) : null}
      <Text type="body">{`Version ${data.version} · ${data.status}`}</Text>
      {versionChanged ? (
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
      <List header={<Heading level={2}>Who gives and receives</Heading>} hasDividers>
        {data.participants.map((participant) => (
          <ListItem
            key={participant.participant.participantId}
            label={`${participant.participant.displayName} gives ${participant.offeredClothing.title}`}
            description={`Receives ${participant.receivedClothing.title} · ${participant.response}`}
          />
        ))}
      </List>
      <Text type="body">{`Your response: ${data.myResponse}`}</Text>
      <Button
        label="Consent"
        size="lg"
        width="100%"
        isDisabled={consentDisabled}
        isLoading={consentMutation.isPending}
        onClick={() => setConfirmKind('consent')}
      />
      <Button
        label="Reject"
        variant="destructive"
        size="lg"
        width="100%"
        isDisabled={rejectDisabled}
        isLoading={rejectMutation.isPending}
        onClick={() => setConfirmKind('reject')}
      />
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
            variant={confirmKind === 'reject' ? 'destructive' : 'primary'}
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
              <Text type="body">{`Current status: ${conflict.currentStatus}. Review the latest version before acting.`}</Text>
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
