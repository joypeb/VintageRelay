'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ChangeEvent } from 'react';

import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { useEventQuery } from '@/lib/api/events';
import { useUploadPhotoMutation } from '@/lib/api/photos';
import { getEventScreenState, isClosed } from '@/lib/event';
import { hasEventSession } from '@/lib/session';
import { validatePhotoFile } from '@/lib/validation/photo';
import type { Photo } from '@/types/photo';

type PhotoUploadScreenProps = {
  eventId: string;
};

const subscribe = () => () => {};

const FILE_INPUT_ID = 'clothing-photo-input';
const FILE_ACCEPT = 'image/jpeg,image/png,image/webp';
const HELP_TEXT = 'Use a JPEG, PNG, or WebP photo of 10 MB or less.';
const FUTURE_STEP_NOTE = 'You will attach this photo when you describe your clothing in the next step.';

export function PhotoUploadScreen({ eventId }: PhotoUploadScreenProps) {
  // localStorage is unavailable during SSR, so render nothing until the client has mounted.
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const hasSession = isMounted && hasEventSession(eventId);
  const { data, error, isPending, isFetching, refetch } = useEventQuery(eventId, {
    enabled: hasSession,
  });
  const uploadMutation = useUploadPhotoMutation(eventId);

  const [heldPhoto, setHeldPhoto] = useState<Photo | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const errorRef = useRef<HTMLSpanElement>(null);

  useEffect(
    () => () => {
      if (previewUrlRef.current !== null) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (photoError !== null) errorRef.current?.focus();
  }, [photoError]);

  if (!isMounted) return null;

  const state = getEventScreenState({ hasSession, data, error, isPending });

  if (state.kind === 'loading') {
    return (
      // Astryx layout components don't forward aria attributes, so a minimal element marks the busy region.
      <section aria-busy="true" aria-label="Loading photo step">
        <VStack gap={4} padding={6}>
          <Skeleton width="70%" height={32} />
          <Skeleton height={48} />
          <Skeleton height={72} />
        </VStack>
      </section>
    );
  }

  if (state.kind === 'no-access' || state.kind === 'not-found') {
    return <EventScreenStatus kind={state.kind} />;
  }

  if (state.kind === 'error') {
    return (
      <EventScreenStatus
        kind="error"
        message={state.message}
        isLoading={isFetching}
        onRetry={() => void refetch()}
      />
    );
  }

  const closed = isClosed(state.event);
  const isUploading = uploadMutation.isPending;

  function revokePreview() {
    if (previewUrlRef.current !== null) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setLocalPreviewUrl(null);
  }

  function openPicker() {
    if (uploadMutation.isPending) return;
    inputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    if (uploadMutation.isPending) return;
    const result = validatePhotoFile(file);
    if (!result.ok) {
      setPhotoError(result.message);
      event.target.value = '';
      return;
    }
    setPhotoError(null);
    setHeldPhoto(null);
    revokePreview();
    const previewUrl = URL.createObjectURL(result.file);
    previewUrlRef.current = previewUrl;
    setLocalPreviewUrl(previewUrl);
    event.target.value = '';
    uploadMutation.mutate(result.file, {
      onSuccess: (photo) => {
        revokePreview();
        setHeldPhoto(photo);
      },
    });
  }

  function handleRemove() {
    revokePreview();
    setHeldPhoto(null);
    setPhotoError(null);
    if (inputRef.current !== null) inputRef.current.value = '';
  }

  const inputDescribedBy = photoError !== null ? 'clothing-photo-error' : 'clothing-photo-help';

  function renderFileControl(disabled: boolean) {
    return (
      <VStack gap={2}>
        <label htmlFor={FILE_INPUT_ID}>Clothing photo</label>
        <input
          ref={inputRef}
          id={FILE_INPUT_ID}
          type="file"
          accept={FILE_ACCEPT}
          onChange={handleFileChange}
          disabled={disabled}
          aria-invalid={photoError !== null}
          aria-describedby={inputDescribedBy}
        />
        <Text type="body" color="secondary" id="clothing-photo-help">
          {HELP_TEXT}
        </Text>
        {photoError !== null && (
          <Text type="body" as="p">
            {/* Text doesn't forward role, so a minimal span carries the alert and focus. */}
            <span
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              id="clothing-photo-error"
              className="text-[var(--color-error)]"
            >
              {photoError}
            </span>
          </Text>
        )}
      </VStack>
    );
  }

  if (closed) {
    return (
      <VStack gap={4} padding={6}>
        <Heading level={1}>Register clothing</Heading>
        <Banner status="warning" title="This event has ended." />
        {heldPhoto !== null ? (
          <VStack gap={2}>
            <img src={heldPhoto.url} alt="Uploaded clothing photo" />
            {/* Text doesn't forward role, so a minimal span announces the status. */}
            <span role="status">Photo ready</span>
            <Button label="Change photo" variant="secondary" size="lg" width="100%" isDisabled />
            <Button label="Remove" variant="ghost" size="lg" width="100%" isDisabled />
          </VStack>
        ) : (
          <VStack gap={4}>
            {renderFileControl(true)}
            <Button
              label="Choose photo"
              variant="primary"
              size="lg"
              width="100%"
              isDisabled
              onClick={openPicker}
            />
          </VStack>
        )}
      </VStack>
    );
  }

  if (heldPhoto !== null && !isUploading) {
    return (
      <VStack gap={4} padding={6}>
        <Heading level={1}>Register clothing</Heading>
        {renderFileControl(false)}
        <img src={heldPhoto.url} alt="Uploaded clothing photo" />
        {/* Text doesn't forward role, so a minimal span announces the status. */}
        <span role="status">Photo ready</span>
        <Text type="body" color="secondary">
          {FUTURE_STEP_NOTE}
        </Text>
        <Button
          label="Change photo"
          variant="secondary"
          size="lg"
          width="100%"
          onClick={openPicker}
        />
        <Button label="Remove" variant="ghost" size="lg" width="100%" onClick={handleRemove} />
      </VStack>
    );
  }

  if (isUploading) {
    return (
      <VStack gap={4} padding={6}>
        <Heading level={1}>Register clothing</Heading>
        {renderFileControl(true)}
        {localPreviewUrl !== null && <img src={localPreviewUrl} alt="Clothing photo preview" />}
        {/* Text doesn't forward role, so a minimal span announces the status.
            No Astryx Button is rendered here: Button always mounts its own empty
            role="status" live region, which would duplicate this announcement. */}
        <span role="status">Uploading photo…</span>
      </VStack>
    );
  }

  return (
    <VStack gap={4} padding={6}>
      <Heading level={1}>Register clothing</Heading>
      {renderFileControl(false)}
      <Button
        label="Choose photo"
        variant="primary"
        size="lg"
        width="100%"
        onClick={openPicker}
      />
    </VStack>
  );
}
