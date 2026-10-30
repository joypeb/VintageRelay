'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useQueryClient } from '@tanstack/react-query';

import {
  useEntryCodePreviewQuery,
  useIsEntryCodeLookupPending,
  useJoinEventMutation,
} from '@/lib/api/events';
import { queryKeys } from '@/lib/api/query-keys';
import { logger } from '@/lib/logger';
import { routes } from '@/lib/routes';
import { isStorageAvailable, saveEventSession } from '@/lib/session';
import { validateDisplayName, validateEntryCode } from '@/lib/validation/join';
import type { JoinFieldErrors } from '@/lib/validation/join';

const STORAGE_UNAVAILABLE_MESSAGE =
  "This browser can't save your event access. Turn off private browsing or try another browser.";

const SESSION_SAVE_FAILED_MESSAGE =
  "You joined, but this browser couldn't keep your event access. Free up browser storage or open a regular (non-private) window, then join again with a different display name.";

type JoinView = 'codeEntry' | 'lookingUp' | 'active' | 'joining';

function errorStatus(message: string | undefined) {
  return message === undefined ? undefined : ({ type: 'error', message } as const);
}

function initialSubmittedCode(initialCode: string | null): string | null {
  if (initialCode === null) return null;
  const result = validateEntryCode(initialCode);
  return result.ok ? result.value : null;
}

export function JoinEventScreen({ initialCode }: { initialCode: string | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutation = useJoinEventMutation();
  const formRef = useRef<HTMLFormElement>(null);
  const [codeInput, setCodeInput] = useState(initialCode?.trim() ?? '');
  const [submittedCode] = useState(() => initialSubmittedCode(initialCode));
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<JoinFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const lookup = useEntryCodePreviewQuery(submittedCode);
  const lookupPending = useIsEntryCodeLookupPending();
  const preview = lookup.data;

  let view: JoinView = 'codeEntry';
  if (preview?.status === 'active') view = mutation.isPending ? 'joining' : 'active';
  else if (submittedCode !== null && lookup.isFetching && preview === undefined) view = 'lookingUp';

  useEffect(() => {
    if (view !== 'active') return;
    const input = formRef.current?.elements.namedItem('displayName');
    if (input instanceof HTMLInputElement) input.focus();
  }, [view]);

  function join() {
    if (mutation.isPending || preview === undefined || submittedCode === null) return;
    setFormError(null);
    const name = validateDisplayName(displayName);
    if (!name.ok) {
      setFieldErrors({ displayName: name.message });
      return;
    }
    setFieldErrors({});
    if (!isStorageAvailable()) {
      setFormError(STORAGE_UNAVAILABLE_MESSAGE);
      return;
    }
    mutation.mutate(
      { eventId: preview.eventId, body: { entryCode: submittedCode, displayName: name.value } },
      {
        onSuccess: ({ event, participantToken }) => {
          try {
            saveEventSession(event.id, { participantToken, participantId: event.me.participantId });
          } catch (err) {
            logger.error('join session save failed', err);
            setFormError(SESSION_SAVE_FAILED_MESSAGE);
            return;
          }
          queryClient.setQueryData(queryKeys.event(event.id), event);
          router.replace(routes.eventHome(event.id));
        },
      },
    );
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (view === 'active') join();
  }

  const showPreview = preview !== undefined && (view === 'active' || view === 'joining');

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate>
      <VStack gap={6} padding={6}>
        <Heading level={1}>Join event</Heading>
        <TextInput
          label="Entry code"
          htmlName="entryCode"
          value={codeInput}
          onChange={setCodeInput}
          isReadOnly={view === 'joining'}
          status={errorStatus(fieldErrors.entryCode)}
          statusVariant="detached"
          autoComplete="off"
          size="lg"
          width="100%"
        />
        {showPreview && (
          <VStack gap={2}>
            <Text type="body">{preview.name}</Text>
            <Badge label="Active" variant="success" />
          </VStack>
        )}
        {showPreview && (
          <TextInput
            label="My display name"
            htmlName="displayName"
            value={displayName}
            onChange={(value) => {
              setDisplayName(value);
            }}
            status={errorStatus(fieldErrors.displayName)}
            statusVariant="detached"
            autoComplete="nickname"
            size="lg"
            width="100%"
          />
        )}
        {formError !== null && (
          <Text type="body" as="p">
            {/* Text doesn't forward role, so a minimal span carries the alert. */}
            <span role="alert" className="text-[var(--color-error)]">
              {formError}
            </span>
          </Text>
        )}
        {showPreview ? (
          <Button
            label="Join"
            type="submit"
            variant="primary"
            size="lg"
            width="100%"
            isLoading={view === 'joining'}
          />
        ) : (
          <Button
            label="Find event"
            type="submit"
            variant="secondary"
            size="lg"
            width="100%"
            isLoading={view === 'lookingUp' || lookupPending}
          />
        )}
      </VStack>
    </form>
  );
}
