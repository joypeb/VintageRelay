'use client';

import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Grid } from '@astryxdesign/core/Grid';
import { Link } from '@astryxdesign/core/Link';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { ApiError } from '@/lib/api/api-error';
import { useClothingListQuery } from '@/lib/api/clothing';
import { routes } from '@/lib/routes';
import { hasEventSession } from '@/lib/session';
import { MEASUREMENT_LABELS } from '@/lib/validation/clothing-form';
import type { MeasurementField } from '@/lib/validation/clothing-form';
import type { Clothing } from '@/types/clothing';

const subscribe = () => () => {};

// A downward drag of at least this far from the top edge refreshes the list.
const PULL_TO_REFRESH_PX = 80;

const SIZE_FALLBACK_ORDER: MeasurementField[] = [
  'totalLength',
  'chest',
  'shoulder',
  'sleeve',
  'waist',
  'hem',
  'inseam',
  'thigh',
];

function formatCardMeta(item: Clothing): string {
  const sizeLabel = item.analysis?.features?.sizeLabel?.trim();
  if (sizeLabel) return `${item.category} · ${sizeLabel} · ${item.owner.displayName}`;
  const fallback = SIZE_FALLBACK_ORDER.map((field) => ({
    field,
    value: item.measurements?.[field],
  })).find((entry): entry is { field: MeasurementField; value: number } => typeof entry.value === 'number');
  if (fallback) return `${item.category} · ${MEASUREMENT_LABELS[fallback.field]} ${fallback.value} in · ${item.owner.displayName}`;
  return `${item.category} · ${item.owner.displayName}`;
}

export function ClothingCard({
  eventId,
  item,
  badge,
}: {
  eventId: string;
  item: Clothing;
  badge?: ReactNode;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = item.photos[0];
  return (
    <Card>
      <Link href={routes.itemDetail(eventId, item.id)} display="block" isStandalone className="w-full [&>span]:w-full">
        <AspectRatio ratio={3 / 4} fit="cover">
          {photo && !photoFailed ? (
            <img src={photo.url} alt={item.title} onError={() => setPhotoFailed(true)} />
          ) : (
            <Text type="body">Photo unavailable</Text>
          )}
        </AspectRatio>
        <Text type="body" maxLines={2}>
          {item.title}
        </Text>
        <Text type="supporting" maxLines={1}>
          {formatCardMeta(item)}
        </Text>
        {badge}
      </Link>
    </Card>
  );
}

export function HomeClothingGrid({ eventId }: { eventId: string }) {
  // localStorage is unavailable during SSR, so read the session only after mount.
  const isMounted = useSyncExternalStore(subscribe, () => true, () => false);
  const { data, error, isPending, isFetching, refetch } = useClothingListQuery(eventId, {
    enabled: isMounted && hasEventSession(eventId),
  });
  const scrollerRef = useRef<HTMLElement | null>(null);
  const startYRef = useRef<number | null>(null);
  const pulledRef = useRef(false);

  if (!isMounted) return null;

  const isUnauthenticated = error instanceof ApiError && error.code === 'UNAUTHENTICATED';
  if (!hasEventSession(eventId) || isUnauthenticated) {
    return <EventScreenStatus kind="no-access" />;
  }

  if (isPending) {
    // Astryx layout components don't forward aria attributes, so a minimal element marks the busy region.
    return (
      <section aria-label="Loading clothing" aria-busy="true">
        <VStack gap={4}>
          <Grid columns={2} gap={4}>
            <AspectRatio ratio={3 / 4}>
              <Skeleton height="100%" />
            </AspectRatio>
            <AspectRatio ratio={3 / 4}>
              <Skeleton height="100%" />
            </AspectRatio>
            <AspectRatio ratio={3 / 4}>
              <Skeleton height="100%" />
            </AspectRatio>
            <AspectRatio ratio={3 / 4}>
              <Skeleton height="100%" />
            </AspectRatio>
          </Grid>
        </VStack>
      </section>
    );
  }

  if (error) {
    return (
      <EventScreenStatus
        kind="error"
        message={error.message || 'Could not load clothing.'}
        isLoading={isFetching}
        onRetry={() => void refetch()}
      />
    );
  }

  // Show newest first regardless of server order, and only others' garments.
  const items = [...(data?.items ?? [])]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .filter((item) => !item.isMine);

  if (items.length === 0) {
    return (
      <EmptyState
        title="No clothes yet"
        description="Register your clothes to join the exchange."
        actions={
          <Button label="Register clothing" variant="primary" size="lg" href={routes.newItem(eventId)} />
        }
      />
    );
  }

  return (
    <section
      ref={scrollerRef}
      aria-label="Available clothing"
      className="overflow-y-auto"
      onTouchStart={(event) => {
        startYRef.current = event.touches[0]?.clientY ?? null;
        pulledRef.current = false;
      }}
      onTouchMove={(event) => {
        if (startYRef.current === null || pulledRef.current) return;
        const currentY = event.touches[0]?.clientY;
        if (currentY === undefined) return;
        const scroller = scrollerRef.current;
        if (scroller && scroller.scrollTop !== 0) return;
        if (window.scrollY !== 0) return;
        if (currentY - startYRef.current >= PULL_TO_REFRESH_PX) {
          pulledRef.current = true;
          void refetch();
        }
      }}
      onTouchEnd={() => {
        startYRef.current = null;
      }}
    >
      <Grid columns={2} gap={4}>
        {items.map((item) => (
          <ClothingCard key={item.id} eventId={eventId} item={item} />
        ))}
      </Grid>
    </section>
  );
}
