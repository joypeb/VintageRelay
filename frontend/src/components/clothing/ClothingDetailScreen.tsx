'use client';

import { useState, useSyncExternalStore } from 'react';

import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Link } from '@astryxdesign/core/Link';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { EstimatedByAI } from '@/components/clothing/EstimatedByAI';
import { PhotoCarousel } from '@/components/clothing/PhotoCarousel';
import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { OfferSheet } from '@/components/trade/OfferSheet';
import { ApiError } from '@/lib/api/api-error';
import { useClothingQuery } from '@/lib/api/clothing';
import { getFormErrorMessage } from '@/lib/api/error-messages';
import { useEventQuery } from '@/lib/api/events';
import { useIntentsQuery, useWithdrawIntentMutation } from '@/lib/api/intents';
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

const subscribe = () => () => {};

// Anchored so /events/{id}/search-anything cannot pass as a same-event search return.
function isSameEventSearchRef(value: string, searchPath: string): boolean {
  return (
    value === searchPath ||
    value.startsWith(`${searchPath}?`) ||
    value.startsWith(`${searchPath}#`) ||
    value.startsWith(`${searchPath}/`)
  );
}

function resolveBackHref(eventId: string, from: string | null | undefined): string {
  const searchPath = routes.search(eventId);
  const candidates: Array<string | null | undefined> = [from];
  if (typeof window !== 'undefined') {
    try {
      candidates.push(new URLSearchParams(window.location.search).get('from'));
    } catch {
      // ignore malformed query strings
    }
  }
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    if (candidate === 'search') return searchPath;
    let decoded = candidate;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      // keep the raw value when decoding fails
    }
    if (isSameEventSearchRef(decoded, searchPath)) return decoded;
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.referrer !== '') {
    try {
      const url = new URL(document.referrer);
      const ref = `${url.pathname}${url.search}`;
      if (isSameEventSearchRef(ref, searchPath)) return ref;
    } catch {
      // ignore malformed referrers
    }
  }
  return routes.eventHome(eventId);
}

export function ClothingDetailScreen({
  eventId,
  clothingId,
  from,
}: {
  eventId: string;
  clothingId: string;
  from?: string;
}) {
  // localStorage is unavailable during SSR, so read the session only after mount.
  const isMounted = useSyncExternalStore(subscribe, () => true, () => false);
  const queryEnabled = isMounted && hasEventSession(eventId);
  const { data: event } = useEventQuery(eventId, { enabled: queryEnabled });
  const eventClosed = event?.status === 'closed';
  const { data, error, isPending, isFetching, refetch } = useClothingQuery(eventId, clothingId, {
    enabled: queryEnabled,
    ...(eventClosed ? { closed: true } : {}),
  });
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const sentQuery = useIntentsQuery(eventId, {
    direction: 'sent',
    status: 'active',
    wantedClothingId: clothingId,
    enabled: queryEnabled,
    closed: eventClosed,
  });
  const activeSent = (sentQuery.data?.items ?? []).find((intent) => intent.status === 'active') ?? null;
  const withdraw = useWithdrawIntentMutation(eventId, activeSent?.id ?? '');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [failedPhotoIds, setFailedPhotoIds] = useState<ReadonlySet<string>>(new Set());

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

  return (
    <VStack gap={6} padding={6}>
      <Link
        href={resolveBackHref(eventId, from)}
        isStandalone
        className="inline-flex min-h-11 min-w-11 items-center"
      >
        Back
      </Link>
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
        <Badge label={categoryLabel} variant="neutral" />
        <Heading level={1}>{clothing.title}</Heading>
        {clothing.status === 'withdrawn' ? <Badge label="Withdrawn" variant="neutral" /> : null}
        <Text type="body">{clothing.description}</Text>
        <Text type="body">Offered by</Text>
        <Text type="body">{clothing.owner.displayName}</Text>
        {clothing.owner.isOrganizer ? <Badge label="Organizer" variant="neutral" /> : null}
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
        <EstimatedByAI analysis={clothing.analysis} />
        {event?.status === 'closed' ? (
          <Text type="body">This event has ended. You can still browse items and confirmed exchanges.</Text>
        ) : null}
        {clothing.isMine ? null : clothing.status !== 'available' ? (
          <Button label="Request exchange" size="lg" width="100%" isDisabled />
        ) : activeSent !== null ? (
          <VStack gap={2}>
            <Text type="body">Request sent. The owner can accept or decline it.</Text>
            {withdrawError !== null ? (
              <Text type="body" as="p">
                <span role="alert">{withdrawError}</span>
              </Text>
            ) : null}
            <Button
              label={withdraw.isPending ? 'Withdrawing…' : 'Withdraw request'}
              size="lg"
              width="100%"
              isLoading={withdraw.isPending}
              isDisabled={event?.status === 'closed' || withdraw.isPending}
              onClick={() => {
                setWithdrawError(null);
                withdraw.mutate(undefined, {
                  onSuccess: () => void sentQuery.refetch(),
                  onError: (err) => setWithdrawError(getFormErrorMessage(err)),
                });
              }}
            />
          </VStack>
        ) : (
          <VStack gap={2}>
            <Button
              label="Request exchange"
              size="lg"
              width="100%"
              isDisabled={event?.status === 'closed'}
              onClick={() => setIsOfferOpen(true)}
            />
          </VStack>
        )}
        {isOfferOpen ? (
          <OfferSheet
            eventId={eventId}
            wantedClothingId={clothingId}
            isOpen={isOfferOpen}
            onOpenChange={setIsOfferOpen}
            onSent={() => void sentQuery.refetch()}
          />
        ) : null}
      </VStack>
    </VStack>
  );
}
