'use client';

import { useSyncExternalStore } from 'react';

import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { List, ListItem } from '@astryxdesign/core/List';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Stack, StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';

import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { useMyItemsQuery } from '@/lib/api/clothing';
import { routes } from '@/lib/routes';

const subscribe = () => () => {};

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
          // Banner doesn't create a live region, so a wrapper announces the outcome.
          <div role="status">
            <Banner status="success" title="Clothing registered." />
          </div>
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
        // Banner doesn't create a live region, so a wrapper announces the outcome.
        <div role="status">
          <Banner
            status="success"
            title="Clothing registered."
            description={items[0] ? `Newest item: ${items[0].title}` : undefined}
          />
        </div>
      ) : null}
      <Button
        label="Register item"
        variant="primary"
        size="lg"
        href={routes.newItem(eventId)}
      />
      <List hasDividers>
      {items.map((item) => {
        const photo = item.photos[0];
        return (
          <ListItem
            key={item.id}
            href={routes.myItemDetail(eventId, item.id)}
            // The row link wraps the label slot only, so the photo, title,
            // and status all live here to stay inside one accessible name.
            label={
              <Stack direction="horizontal" gap={3} vAlign="center">
                <StackItem>
                  {photo ? (
                    <img src={photo.url} alt={item.title} className="h-12 w-12 object-cover" />
                  ) : (
                    <Text type="body">Photo unavailable</Text>
                  )}
                </StackItem>
                <StackItem size="fill">
                  <VStack gap={1}>
                    <Text type="body" maxLines={2}>
                      {item.title}
                    </Text>
                    <Stack direction="horizontal" gap={2} vAlign="center" wrap="wrap">
                      <Token label={statusLabel(item.status)} color={statusTokenColor(item.status)} />
                      {item.analysis?.status === 'pending' ? (
                        <Text type="body">AI analyzing…</Text>
                      ) : null}
                    </Stack>
                  </VStack>
                </StackItem>
              </Stack>
            }
          />
        );
      })}
      </List>
    </VStack>
  );
}
