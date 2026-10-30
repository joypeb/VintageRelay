'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ChangeEvent } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useQueryClient } from '@tanstack/react-query';

import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { ApiError } from '@/lib/api/api-error';
import { useEventQuery } from '@/lib/api/events';
import { useUploadPhotoMutation } from '@/lib/api/photos';
import { queryKeys } from '@/lib/api/query-keys';
import { getEventScreenState, getPhotoUploadFailure, isClosed } from '@/lib/event';
import { logger } from '@/lib/logger';
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
  const queryClient = useQueryClient();

  const [heldPhoto, setHeldPhoto] = useState<Photo | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [chosenFile, setChosenFile] = useState<File | null>(null);
  const [displayFailed, setDisplayFailed] = useState(false);
  const [uploadClosed, setUploadClosed] = useState(false);
  const [uploadNoAccess, setUploadNoAccess] = useState(false);
  const [uploadNotFound, setUploadNotFound] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const errorRef = useRef<HTMLElement>(null);

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
      <VStack as="section" aria-busy="true" aria-label="Loading photo step" gap={4} padding={6}>
        <Skeleton width="70%" height={32} />
        <Skeleton height={48} />
        <Skeleton height={72} />
      </VStack>
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

  const closed = isClosed(state.event) || uploadClosed;
  const isUploading = uploadMutation.isPending;

  function clearUploadOverrides() {
    setUploadClosed(false);
    setUploadNoAccess(false);
    setUploadNotFound(false);
  }

  function handleUploadSuccess(photo: Photo) {
    revokePreview();
    setHeldPhoto(photo);
    setDisplayFailed(false);
    setChosenFile(null);
    setPhotoError(null);
  }

  function handleUploadError(error: unknown) {
    if (!(error instanceof ApiError)) logger.error('photo upload failed', error);
    const failure = getPhotoUploadFailure(error);
    switch (failure.kind) {
      case 'photoField':
      case 'form':
        setPhotoError(failure.message);
        break;
      case 'closed':
        setUploadClosed(true);
        void queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId), exact: true });
        break;
      case 'no-access':
        setUploadNoAccess(true);
        break;
      case 'not-found':
        setUploadNotFound(true);
        break;
    }
  }

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
      revokePreview();
      setHeldPhoto(null);
      setChosenFile(null);
      setPhotoError(result.message);
      event.target.value = '';
      return;
    }
    clearUploadOverrides();
    setPhotoError(null);
    setHeldPhoto(null);
    revokePreview();
    const previewUrl = URL.createObjectURL(result.file);
    previewUrlRef.current = previewUrl;
    setLocalPreviewUrl(previewUrl);
    setChosenFile(result.file);
    event.target.value = '';
    uploadMutation.mutate(result.file, {
      onSuccess: handleUploadSuccess,
      onError: handleUploadError,
    });
  }

  function handleRetry() {
    if (uploadMutation.isPending || chosenFile === null) return;
    setPhotoError(null);
    uploadMutation.mutate(chosenFile, {
      onSuccess: handleUploadSuccess,
      onError: handleUploadError,
    });
  }

  function handleRemove() {
    revokePreview();
    setHeldPhoto(null);
    setDisplayFailed(false);
    setChosenFile(null);
    setPhotoError(null);
    clearUploadOverrides();
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
          <Text
            type="body"
            as="p"
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            id="clothing-photo-error"
            className="text-error"
          >
            {photoError}
          </Text>
        )}
      </VStack>
    );
  }

  if (uploadNoAccess) {
    return <EventScreenStatus kind="no-access" />;
  }

  if (uploadNotFound) {
    return <EventScreenStatus kind="not-found" />;
  }

  if (closed) {
    return (
      <VStack gap={4} padding={6}>
        <Heading level={1}>Register clothing</Heading>
        {heldPhoto !== null ? (
          <VStack gap={2}>
            <img src={heldPhoto.url} alt="Uploaded clothing photo" />
            <Text type="body" role="status">
              Photo ready
            </Text>
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
        <img
          src={heldPhoto.url}
          alt="Uploaded clothing photo"
          onError={() => setDisplayFailed(true)}
        />
        {displayFailed && <Text type="body">This photo could not be displayed.</Text>}
        <Text type="body" role="status">
          Photo ready
        </Text>
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
        {/* No Astryx Button is rendered here: Button always mounts its own empty
            role="status" live region, which would duplicate this announcement. */}
        <Text type="body" role="status">
          Uploading photo…
        </Text>
      </VStack>
    );
  }

  if (photoError !== null && !isUploading) {
    return (
      <VStack gap={4} padding={6}>
        <Heading level={1}>Register clothing</Heading>
        {renderFileControl(false)}
        {localPreviewUrl !== null && <img src={localPreviewUrl} alt="Clothing photo preview" />}
        {chosenFile !== null && (
          <Button
            label="Try again"
            variant="primary"
            size="lg"
            width="100%"
            onClick={handleRetry}
            isDisabled={isUploading}
          />
        )}
        <Button
          label="Choose another photo"
          variant="secondary"
          size="lg"
          width="100%"
          onClick={openPicker}
          isDisabled={isUploading}
        />
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
