'use client';

import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';

import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Link } from '@astryxdesign/core/Link';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';

import { EstimatedByAI } from '@/components/clothing/EstimatedByAI';
import { PhotoCarousel } from '@/components/clothing/PhotoCarousel';
import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { ApiError } from '@/lib/api/api-error';
import { useClothingQuery, useDeleteClothingMutation } from '@/lib/api/clothing';
import { getFormErrorMessage } from '@/lib/api/error-messages';
import { useEventQuery } from '@/lib/api/events';
import { useAcceptIntentMutation, useDeclineIntentMutation, useIntentsQuery } from '@/lib/api/intents';
import { useProposalsQuery } from '@/lib/api/proposals';
import { routes } from '@/lib/routes';
import { hasEventSession } from '@/lib/session';
import { CATEGORY_OPTIONS, MEASUREMENT_LABELS } from '@/lib/validation/clothing-form';
import type { MeasurementField } from '@/lib/validation/clothing-form';

const MEASUREMENT_ORDER: MeasurementField[] = [
  'totalLength',
  'chest',
  'shoulder',
  'sleeve',
  'waist',
  'hem',
  'inseam',
  'thigh',
];

function statusTokenColor(status: string): 'green' | 'blue' | 'gray' | 'default' {
  if (status === 'available') return 'green';
  if (status === 'confirmed') return 'blue';
  if (status === 'withdrawn') return 'gray';
  return 'default';
}

function statusLabel(status: string): string {
  if (status === 'available') return 'Available';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'withdrawn') return 'Withdrawn';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const subscribe = () => () => {};

function MyItemRequestsSection({
  eventId,
  closed,
  requestsQuery,
  relatedQuery,
}: {
  eventId: string;
  closed: boolean;
  requestsQuery: ReturnType<typeof useIntentsQuery>;
  relatedQuery: ReturnType<typeof useProposalsQuery>;
}) {
  if (requestsQuery.isPending) {
    return (
      <VStack gap={2}>
        <Heading level={2}>Requests</Heading>
        <Text type="body">Loading requests…</Text>
      </VStack>
    );
  }
  if (requestsQuery.error) {
    return (
      <VStack gap={2}>
        <Heading level={2}>Requests</Heading>
        <Text type="body" as="p">
          <span role="alert">{getFormErrorMessage(requestsQuery.error)}</span>
        </Text>
        <Button label="Retry" size="lg" width="100%" onClick={() => void requestsQuery.refetch()} />
      </VStack>
    );
  }
  const items = (requestsQuery.data?.items ?? []).filter((intent) => intent.status === 'active');
  const related = relatedQuery.data?.items ?? [];
  return (
    <VStack gap={2}>
      <Heading level={2}>Requests</Heading>
      {items.length === 0 ? (
        <Text type="body">No active requests for this item yet.</Text>
      ) : (
        <VStack gap={2}>
          {items.map((intent) => (
            <MyItemRequestRow key={intent.id} eventId={eventId} intentId={intent.id} offerTitle={intent.offeredClothing.title} closed={closed} />
          ))}
        </VStack>
      )}
      {related.length > 0 ? (
        <VStack gap={2}>
          <Heading level={3}>Related exchanges</Heading>
          {related.map((proposal) => (
            <Link
              key={proposal.id}
              href={routes.tradeDetail(eventId, proposal.id)}
              isStandalone
            >
              {`Version ${proposal.version} · ${proposal.status} · Your response: ${proposal.myResponse}`}
            </Link>
          ))}
        </VStack>
      ) : null}
    </VStack>
  );
}

function MyItemRequestRow({
  eventId,
  intentId,
  offerTitle,
  closed,
}: {
  eventId: string;
  intentId: string;
  offerTitle: string;
  closed: boolean;
}) {
  const accept = useAcceptIntentMutation(eventId, intentId);
  const decline = useDeclineIntentMutation(eventId, intentId);
  const [error, setError] = useState<string | null>(null);

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
      <Text type="body">{`Offered: ${offerTitle}`}</Text>
      {error !== null ? (
        <Text type="body" as="p">
          <span role="alert">{error}</span>
        </Text>
      ) : null}
      {closed ? null : (
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
      )}
    </VStack>
  );
}

export function MyItemDetailScreen({
  eventId,
  clothingId,
}: {
  eventId: string;
  clothingId: string;
}) {
  // localStorage is unavailable during SSR, so read the session only after mount.
  const isMounted = useSyncExternalStore(subscribe, () => true, () => false);
  const router = useRouter();
  const queryEnabled = isMounted && hasEventSession(eventId);
  const { data, error, isPending, isFetching, refetch } = useClothingQuery(eventId, clothingId, {
    enabled: queryEnabled,
  });
  const { data: event } = useEventQuery(eventId, { enabled: queryEnabled });
  const eventClosed = event?.status === 'closed';
  const deleteMutation = useDeleteClothingMutation(eventId, clothingId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [failedPhotoIds, setFailedPhotoIds] = useState<ReadonlySet<string>>(new Set());
  const requestsQuery = useIntentsQuery(eventId, {
    direction: 'received',
    status: ['active', 'declined', 'withdrawn', 'invalidated'],
    wantedClothingId: clothingId,
    enabled: queryEnabled,
    closed: eventClosed,
  });
  const relatedQuery = useProposalsQuery(eventId, {
    clothingId,
    enabled: queryEnabled,
    closed: eventClosed,
  });

  if (!isMounted) return null;

  const code = error instanceof ApiError ? error.code : null;
  if (!hasEventSession(eventId) || code === 'UNAUTHENTICATED') {
    return <EventScreenStatus kind="no-access" />;
  }

  if (isPending) {
    // Astryx layout components don't forward aria attributes, so a minimal element marks the busy region.
    return (
      <section aria-label="Loading clothing" aria-busy="true">
        <VStack gap={4} padding={6}>
          <Skeleton height={240} />
          <Skeleton width="30%" height={24} />
          <Skeleton width="70%" height={32} />
          <Skeleton height={72} />
        </VStack>
      </section>
    );
  }

  if (code === 'NOT_FOUND') {
    return (
      <VStack gap={4} padding={6}>
        <Text type="body">This clothing item could not be found.</Text>
        <Link href={routes.eventHome(eventId)}>Home</Link>
      </VStack>
    );
  }

  if (error) {
    return (
      <EventScreenStatus
        kind="error"
        message={getFormErrorMessage(error)}
        isLoading={isFetching}
        onRetry={() => void refetch()}
      />
    );
  }

  if (!data) {
    return (
      <VStack gap={4} padding={6}>
        <Text type="body">This clothing item could not be found.</Text>
        <Link href={routes.eventHome(eventId)}>Home</Link>
      </VStack>
    );
  }

  const clothing = data;
  const isConfirmed = clothing.status === 'confirmed';
  const isWithdrawn = clothing.status === 'withdrawn';
  const isClosed = event?.status === 'closed';
  const showSaved =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('saved') === '1';
  // Confirmed garments need cancellation via Trades, withdrawn ones are gone,
  // and closed events allow no changes at all.
  const locked = isConfirmed || isWithdrawn || isClosed === true;
  const confirmedProposal =
    relatedQuery.data?.items.find((proposal) => proposal.status === 'confirmed') ?? null;
  const categoryLabel =
    CATEGORY_OPTIONS.find((option) => option.value === clothing.category)?.label ?? clothing.category;
  const measurements = MEASUREMENT_ORDER.filter(
    (field): field is MeasurementField => clothing.measurements?.[field] != null,
  );
  const items = clothing.photos.map((photo) => ({ key: photo.id, ...photo }));
  const count = items.length;

  function markPhotoFailed(id: string) {
    setFailedPhotoIds((prev) => new Set(prev).add(id));
  }

  // Dismissal is blocked while the withdraw request is in flight.
  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen && deleteMutation.isPending) return;
    setIsDialogOpen(nextOpen);
  }

  function handleConfirmDelete() {
    deleteMutation.mutate(undefined, {
      onSuccess: () => router.push(routes.myItems(eventId)),
    });
  }

  return (
    <VStack gap={6} padding={6}>
      <Link
        href={routes.myItems(eventId)}
        isStandalone
        className="inline-flex min-h-11 min-w-11 items-center"
      >
        Back
      </Link>
      {showSaved ? (
        // Banner doesn't create a live region, so a wrapper announces the outcome.
        <div role="status">
          <Banner status="success" title="Saved." description={clothing.title} />
        </div>
      ) : null}
      <PhotoCarousel
        items={items}
        renderMedia={(item, index) =>
          failedPhotoIds.has(item.id) ? (
            <Text type="body">Photo unavailable</Text>
          ) : (
            <img
              src={item.url}
              alt={`${clothing.title} photo ${index + 1}`}
              onError={() => markPhotoFailed(item.id)}
            />
          )
        }
        getOverlayMedia={(item, index) =>
          failedPhotoIds.has(item.id)
            ? null
            : { src: item.url, alt: `${clothing.title} photo ${index + 1} of ${count}` }
        }
      />
      <VStack gap={2}>
        <Stack direction="horizontal">
          <Token label={categoryLabel} />
        </Stack>
        <Heading level={1}>{clothing.title}</Heading>
        <Stack direction="horizontal">
          <Token label={statusLabel(clothing.status)} color={statusTokenColor(clothing.status)} />
        </Stack>
        <Text type="body">{clothing.description}</Text>
        {measurements.length > 0 ? (
          <VStack gap={2}>
            <Heading level={2}>Measurements</Heading>
            <Grid columns={2} gap={2}>
              {measurements.map((field) => (
                <VStack key={field} gap={1}>
                  <Text type="body">{`${MEASUREMENT_LABELS[field]} (in)`}</Text>
                  <Text type="body">{String(clothing.measurements?.[field])}</Text>
                </VStack>
              ))}
            </Grid>
          </VStack>
        ) : null}
        {isWithdrawn ? null : (
          <>
            {isClosed === true ? (
              <Text type="body">
                This event has ended. You can still browse items and confirmed exchanges.
              </Text>
            ) : null}
            {isConfirmed && isClosed !== true ? (
              <Text type="body">
                This item is locked for an exchange. To cancel it, go to Trades &gt; Exchanges and
                cancel the exchange first.
              </Text>
            ) : null}
            {isConfirmed && confirmedProposal !== null ? (
              <Link
                href={routes.tradeDetail(eventId, confirmedProposal.id)}
                isStandalone
              >
                View confirmed exchange
              </Link>
            ) : null}
            {locked ? (
              <Button label="Edit" size="lg" width="100%" isDisabled />
            ) : (
              <Button
                label="Edit"
                size="lg"
                width="100%"
                href={routes.myItemEdit(eventId, clothingId)}
              />
            )}
            <Button
              label="Delete"
              variant="destructive"
              size="lg"
              width="100%"
              isDisabled={locked}
              onClick={() => setIsDialogOpen(true)}
            />
          </>
        )}
        <EstimatedByAI analysis={clothing.analysis} />
        <MyItemRequestsSection
          eventId={eventId}
          closed={isClosed === true}
          requestsQuery={requestsQuery}
          relatedQuery={relatedQuery}
        />
      </VStack>
      <Dialog isOpen={isDialogOpen} onOpenChange={handleDialogOpenChange} purpose="info">
        <DialogHeader title="Delete this item?" />
        <VStack gap={4} padding={6}>
          <Text type="body">
            {`Remove "${clothing.title}" from the exchange corner? This can't be undone. Active requests and pending proposals for this item will be invalidated.`}
          </Text>
          {deleteMutation.error && (
            // Banner doesn't create a live region, so a wrapper announces the error.
            <div role="alert">
              <Banner status="error" title={getFormErrorMessage(deleteMutation.error)} />
            </div>
          )}
          <Button
            label="Confirm removal"
            variant="destructive"
            size="lg"
            width="100%"
            isLoading={deleteMutation.isPending}
            onClick={handleConfirmDelete}
          />
          <Button
            label="Keep item"
            variant="ghost"
            size="lg"
            width="100%"
            isDisabled={deleteMutation.isPending}
            onClick={() => handleDialogOpenChange(false)}
          />
        </VStack>
      </Dialog>
    </VStack>
  );
}
