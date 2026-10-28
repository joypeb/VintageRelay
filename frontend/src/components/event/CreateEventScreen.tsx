'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';

import { useCreateEventMutation } from '@/lib/api/events';
import { routes } from '@/lib/routes';
import { saveEventSession } from '@/lib/session';
import { toCreateEventRequest } from '@/lib/validation/event';

export function CreateEventScreen() {
  const router = useRouter();
  const mutation = useCreateEventMutation();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');

  function submit() {
    if (mutation.isPending) return;
    mutation.mutate(toCreateEventRequest({ name, organizerDisplayName: displayName }), {
      onSuccess: ({ event, participantToken }) => {
        saveEventSession(event.id, {
          participantToken,
          participantId: event.me.participantId,
          share: {
            name: event.name,
            entryCode: event.entryCode,
            entryUrl: event.entryUrl,
          },
        });
        router.replace(routes.eventCreated(event.id));
      },
    });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  function handleNameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    focusDisplayName();
  }

  function focusDisplayName() {
    const field = formRef.current?.elements.namedItem('organizerDisplayName');
    if (field instanceof HTMLInputElement) field.focus();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate>
      <VStack gap={6} padding={6}>
        <Heading level={1}>Create event</Heading>
        <VStack gap={4}>
          <TextInput
            label="Event name"
            htmlName="name"
            value={name}
            onChange={setName}
            onKeyDown={handleNameKeyDown}
            autoComplete="off"
            size="lg"
            width="100%"
          />
          <TextInput
            label="My display name"
            htmlName="organizerDisplayName"
            value={displayName}
            onChange={setDisplayName}
            autoComplete="nickname"
            size="lg"
            width="100%"
          />
        </VStack>
        <VStack gap={1}>
          <Text type="body" color="secondary">
            Creating an event also registers you as a participant.
          </Text>
          <Text type="body" color="secondary">
            The event starts immediately. There is no separate start button.
          </Text>
        </VStack>
        <Button
          label="Create event"
          type="submit"
          variant="primary"
          size="lg"
          width="100%"
          isLoading={mutation.isPending}
        />
      </VStack>
    </form>
  );
}
