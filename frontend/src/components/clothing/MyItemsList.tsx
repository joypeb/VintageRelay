'use client';

import { useSyncExternalStore } from 'react';

import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { List, ListItem } from '@astryxdesign/core/List';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { useMyItemsQuery } from '@/lib/api/clothing';
import { routes } from '@/lib/routes';

const subscribe = () => () => {};

export function MyItemsList({ eventId }: { eventId: string }) {
  const isMounted = useSyncExternalStore(subscribe, () => true, () => false);
  const registered =
    isMounted &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('registered') === '1';
  const { data, error, isPending, isFetching, refetch } = useMyItemsQuery(eventId);

  if (isPending) {
    // Astryx layout components don't forward aria attributes, so a minimal element marks the busy region.
    return (
      <section aria-label="Loading your items" aria-busy="true">
        <VStack gap={4} padding={6}>
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </VStack>
      </section>
    );
  }

  if (error) {
    return (
      <EventScreenStatus
        kind="error"
        message={error.message || 'Could not load your items.'}
        isLoading={isFetching}
        onRetry={() => void refetch()}
      />
    );
  }

  // Show newest first regardless of server order, and only own garments.
  const items = [...(data?.items ?? [])]
    .filter((item) => item.isMine)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  if (items.length === 0) {
    return (
      <VStack gap={4} padding={6}>
        {registered ? (
          <Text type="body" as="p" role="status">
            Clothing registered.
          </Text>
        ) : null}
        <EmptyState
          title="No items yet"
          description="Register your first item to start swapping."
          actions={
            <Button
              label="Register item"
              variant="primary"
              size="lg"
              href={routes.newItem(eventId)}
            />
          }
        />
      </VStack>
    );
  }

  return (
    <VStack gap={4} padding={6}>
      {registered ? (
        <Text type="body" as="p" role="status">
          Clothing registered.
        </Text>
      ) : null}
      <List hasDividers>
      {items.map((item) => {
        const photo = item.photos[0];
        return (
          <ListItem
            key={item.id}
            href={routes.myItemDetail(eventId, item.id)}
            // The row link wraps the label slot only, so the photo, title,
            // and badge all live here to stay inside one accessible name.
            label={
              <Stack direction="horizontal" gap={3} vAlign="center">
                {photo ? (
                  <img src={photo.url} alt={item.title} className="h-12 w-12 object-cover" />
                ) : (
                  <Text type="body">Photo unavailable</Text>
                )}
                <Text type="body">{item.title}</Text>
                <Badge label={item.status} variant="neutral" />
              </Stack>
            }
          />
        );
      })}
      </List>
    </VStack>
  );
}
