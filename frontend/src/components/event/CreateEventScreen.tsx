'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';

import { ApiError } from '@/lib/api/api-error';
import { useCreateEventMutation } from '@/lib/api/events';
import { routes } from '@/lib/routes';
import { saveEventSession } from '@/lib/session';
import { mapServerFieldErrors, validateCreateEventForm } from '@/lib/validation/event';
import type { CreateEventField, CreateEventFieldErrors } from '@/lib/validation/event';

function errorStatus(message: string | undefined) {
  return message === undefined ? undefined : ({ type: 'error', message } as const);
}

export function CreateEventScreen() {
  const router = useRouter();
  const mutation = useCreateEventMutation();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CreateEventFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function focusField(field: CreateEventField) {
    const input = formRef.current?.elements.namedItem(field);
    if (input instanceof HTMLInputElement) input.focus();
  }

  function focusFirstInvalid(errors: CreateEventFieldErrors) {
    if (errors.name !== undefined) focusField('name');
    else if (errors.organizerDisplayName !== undefined) focusField('organizerDisplayName');
  }

  function clearFieldError(field: CreateEventField) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function submit() {
    if (mutation.isPending) return;
    setFormError(null);
    const result = validateCreateEventForm({ name, organizerDisplayName: displayName });
    if (!result.ok) {
      setFieldErrors(result.errors);
      focusFirstInvalid(result.errors);
      return;
    }
    setFieldErrors({});
    mutation.mutate(result.value, {
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
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
          const mapped = mapServerFieldErrors(error.details);
          setFieldErrors(mapped.fieldErrors);
          setFormError(mapped.formError);
          focusFirstInvalid(mapped.fieldErrors);
        }
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
    focusField('organizerDisplayName');
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
            onChange={(value) => {
              setName(value);
              clearFieldError('name');
            }}
            status={errorStatus(fieldErrors.name)}
            statusVariant="detached"
            onKeyDown={handleNameKeyDown}
            autoComplete="off"
            size="lg"
            width="100%"
          />
          <TextInput
            label="My display name"
            htmlName="organizerDisplayName"
            value={displayName}
            onChange={(value) => {
              setDisplayName(value);
              clearFieldError('organizerDisplayName');
            }}
            status={errorStatus(fieldErrors.organizerDisplayName)}
            statusVariant="detached"
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
        {formError !== null && (
          <Text type="body" color="accent" as="p">
            <span role="alert">{formError}</span>
          </Text>
        )}
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
