'use client';

import { useState } from 'react';

import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { useMyItemsQuery } from '@/lib/api/clothing';
import { getFormErrorMessage } from '@/lib/api/error-messages';
import { useEventQuery } from '@/lib/api/events';
import { useRegisterIntentMutation } from '@/lib/api/intents';
import { routes } from '@/lib/routes';

export function OfferSheet({
  eventId,
  wantedClothingId,
  isOpen,
  onOpenChange,
  onSent,
}: {
  eventId: string;
  wantedClothingId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSent: () => void;
}) {
  const { data: event } = useEventQuery(eventId, { enabled: isOpen });
  const closed = event?.status === 'closed';
  const { data, isPending, error, refetch } = useMyItemsQuery(eventId, {
    enabled: isOpen,
    closed,
  });
  const register = useRegisterIntentMutation(eventId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const available = (data?.items ?? []).filter((item) => item.status === 'available');

  async function handleSend() {
    if (selectedId === null || register.isPending || closed) return;
    try {
      await register.mutateAsync({
        offeredClothingId: selectedId,
        wantedClothingId,
      });
      onOpenChange(false);
      onSent();
    } catch {
      // Error shown inline below; sheet stays open for retry.
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" label="Choose an item to offer">
      <VStack gap={4}>
        <Heading level={2}>Choose an item to offer</Heading>
        <Text type="body">Each exchange is 1-for-1: you give one item and receive one.</Text>
        {isPending ? (
          <Text type="body">Loading your items…</Text>
        ) : error ? (
          <VStack gap={2}>
            <Text type="body" as="p">
              <span role="alert">{getFormErrorMessage(error)}</span>
            </Text>
            <Button label="Try again" size="lg" width="100%" onClick={() => void refetch()} />
          </VStack>
        ) : available.length === 0 ? (
          <VStack gap={2}>
            <Text type="body">You have no available items to offer. Register one first.</Text>
            <Button label="Register item" size="lg" width="100%" href={routes.newItem(eventId)} />
          </VStack>
        ) : (
          <List header={<Heading level={3}>Your available items</Heading>} hasDividers>
            {available.map((item) => (
              <ListItem
                key={item.id}
                label={item.title}
                description={item.category}
                isSelected={selectedId === item.id}
                onClick={() => setSelectedId(item.id)}
              />
            ))}
          </List>
        )}
        {register.error ? (
          <Text type="body" as="p">
            <span role="alert">{getFormErrorMessage(register.error)}</span>
          </Text>
        ) : null}
        <Button
          label={register.isPending ? 'Sending…' : 'Send request'}
          variant="primary"
          size="lg"
          width="100%"
          isLoading={register.isPending}
          isDisabled={selectedId === null || register.isPending || available.length === 0 || closed}
          onClick={() => void handleSend()}
        />
        <Button
          label="Cancel"
          variant="ghost"
          size="lg"
          width="100%"
          isDisabled={register.isPending}
          onClick={() => onOpenChange(false)}
        />
      </VStack>
    </BottomSheet>
  );
}
