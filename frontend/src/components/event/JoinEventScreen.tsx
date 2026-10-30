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

import { ApiError } from '@/lib/api/api-error';
import {
  useEntryCodePreviewQuery,
  useIsEntryCodeLookupPending,
  useJoinEventMutation,
} from '@/lib/api/events';
import { queryKeys } from '@/lib/api/query-keys';
import { getJoinFailure, getLookupFailure } from '@/lib/event';
import { logger } from '@/lib/logger';
import { routes } from '@/lib/routes';
import { hasEventSession, isStorageAvailable, saveEventSession } from '@/lib/session';
import { validateDisplayName, validateEntryCode } from '@/lib/validation/join';
import type { JoinFieldErrors } from '@/lib/validation/join';

const STORAGE_UNAVAILABLE_MESSAGE =
  "This browser can't save your event access. Turn off private browsing or try another browser.";

const SESSION_SAVE_FAILED_MESSAGE =
  "You joined, but this browser couldn't keep your event access. Free up browser storage or open a regular (non-private) window, then join again with a different display name.";

const CLOSED_MESSAGE = 'This event has ended. You can no longer join.';

const ALREADY_JOINED_MESSAGE = "You've already joined this event on this device.";

type JoinView = 'closed' | 'alreadyJoined' | 'codeEntry' | 'lookingUp' | 'active' | 'joining';

function errorStatus(message: string | undefined) {
  return message === undefined ? undefined : ({ type: 'error', message } as const);
}

function withoutField(errors: JoinFieldErrors, field: keyof JoinFieldErrors): JoinFieldErrors {
  const next = { ...errors };
  delete next[field];
  return next;
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
  const [submittedCode, setSubmittedCode] = useState(() => initialSubmittedCode(initialCode));
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<JoinFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [closedOverride, setClosedOverride] = useState(false);
  const [alreadyJoinedOverride, setAlreadyJoinedOverride] = useState(false);
  const closedRef = useRef<HTMLSpanElement>(null);

  const lookup = useEntryCodePreviewQuery(submittedCode);
  const lookupPending = useIsEntryCodeLookupPending();
  const preview = lookup.data;

  const lookupFailure = lookup.isError ? getLookupFailure(lookup.error) : null;
  const lookupError = lookup.isError ? lookup.error : null;

  let view: JoinView = 'codeEntry';
  if (closedOverride) view = 'closed';
  else if (preview !== undefined && (alreadyJoinedOverride || hasEventSession(preview.eventId)))
    view = 'alreadyJoined';
  else if (preview?.status === 'closed') view = 'closed';
  else if (preview?.status === 'active') view = mutation.isPending ? 'joining' : 'active';
  else if (submittedCode !== null && lookup.isFetching && preview === undefined) view = 'lookingUp';

  useEffect(() => {
    if (view !== 'active') return;
    const input = formRef.current?.elements.namedItem('displayName');
    if (input instanceof HTMLInputElement) input.focus();
  }, [view]);

  useEffect(() => {
    if (lookupError !== null && !(lookupError instanceof ApiError)) {
      logger.error('entry code lookup failed', lookupError);
    }
  }, [lookupError]);

  useEffect(() => {
    if (closedOverride) closedRef.current?.focus();
  }, [closedOverride]);

  function handleJoinError(err: unknown) {
    if (!(err instanceof ApiError)) logger.error('join event failed', err);
    const failure = getJoinFailure(err);
    switch (failure.kind) {
      case 'displayNameField':
        setFieldErrors({ displayName: failure.message });
        break;
      case 'closed':
        setClosedOverride(true);
        break;
      case 'codeNotFound':
        setSubmittedCode(null);
        setFieldErrors({ entryCode: failure.message });
        break;
      case 'fields':
        setFieldErrors(failure.fieldErrors);
        setFormError(failure.formError);
        break;
      case 'form':
        setFormError(failure.message);
        break;
    }
  }

  function join() {
    if (mutation.isPending || preview === undefined || submittedCode === null) return;
    setFormError(null);
    const name = validateDisplayName(displayName);
    if (!name.ok) {
      setFieldErrors({ displayName: name.message });
      return;
    }
    setFieldErrors({});
    if (hasEventSession(preview.eventId)) {
      setAlreadyJoinedOverride(true);
      return;
    }
    if (!isStorageAvailable()) {
      setFormError(STORAGE_UNAVAILABLE_MESSAGE);
      return;
    }
    mutation.mutate(
      { eventId: preview.eventId, body: { entryCode: submittedCode, displayName: name.value } },
      {
        onError: handleJoinError,
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

  function findEvent() {
    if (lookupPending) return;
    const code = validateEntryCode(codeInput);
    if (!code.ok) {
      setFieldErrors({ entryCode: code.message });
      return;
    }
    setFieldErrors((prev) => withoutField(prev, 'entryCode'));
    if (code.value === submittedCode && lookup.isError) void lookup.refetch();
    else setSubmittedCode(code.value);
  }

  function handleCodeChange(value: string) {
    setCodeInput(value);
    setSubmittedCode(null);
    setFieldErrors({});
    setFormError(null);
    setClosedOverride(false);
    setAlreadyJoinedOverride(false);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (view === 'active') join();
    else if (view === 'codeEntry') findEvent();
  }

  const showPreview = preview !== undefined && (view === 'active' || view === 'joining');
  const codeError =
    fieldErrors.entryCode ??
    (lookupFailure?.kind === 'codeField' ? lookupFailure.message : undefined);
  const shownFormError =
    formError ?? (lookupFailure?.kind === 'form' ? lookupFailure.message : null);

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate>
      <VStack gap={6} padding={6}>
        <Heading level={1}>Join event</Heading>
        <TextInput
          label="Entry code"
          htmlName="entryCode"
          value={codeInput}
          onChange={handleCodeChange}
          isReadOnly={view === 'joining'}
          status={errorStatus(codeError)}
          statusVariant="detached"
          autoComplete="off"
          size="lg"
          width="100%"
        />
        {view === 'closed' && (
          <VStack gap={2}>
            {preview !== undefined && (
              <>
                <Text type="body">{preview.name}</Text>
                <Badge label="Closed" variant="neutral" />
              </>
            )}
            <Text type="body" as="p">
              <span ref={closedRef} role="status" aria-live="polite" tabIndex={-1}>
                {CLOSED_MESSAGE}
              </span>
            </Text>
          </VStack>
        )}
        {view === 'alreadyJoined' && preview !== undefined && (
          <VStack gap={2}>
            <Text type="body">{preview.name}</Text>
            <Badge
              label={preview.status === 'closed' ? 'Closed' : 'Active'}
              variant={preview.status === 'closed' ? 'neutral' : 'success'}
            />
            <Text type="body" as="p">
              <span role="status" aria-live="polite">
                {ALREADY_JOINED_MESSAGE}
              </span>
            </Text>
          </VStack>
        )}
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
              setFieldErrors((prev) => withoutField(prev, 'displayName'));
              setFormError(null);
            }}
            status={errorStatus(fieldErrors.displayName)}
            statusVariant="detached"
            autoComplete="nickname"
            size="lg"
            width="100%"
          />
        )}
        {shownFormError !== null && (
          <Text type="body" as="p">
            {/* Text doesn't forward role, so a minimal span carries the alert. */}
            <span role="alert" className="text-[var(--color-error)]">
              {shownFormError}
            </span>
          </Text>
        )}
        {view === 'alreadyJoined' && preview !== undefined ? (
          <Button
            label="Go to event home"
            size="lg"
            width="100%"
            href={routes.eventHome(preview.eventId)}
          />
        ) : view === 'closed' ? (
          <Button label="Go to start" size="lg" width="100%" href={routes.landing()} />
        ) : showPreview ? (
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
