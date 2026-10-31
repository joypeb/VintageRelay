'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import type { ChangeEvent } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useQueryClient } from '@tanstack/react-query';

import { ClothingDetailsForm } from '@/components/clothing/ClothingDetailsForm';
import type { RegisterOutcome } from '@/components/clothing/ClothingDetailsForm';
import { PhotoCarousel } from '@/components/clothing/PhotoCarousel';
import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { ApiError } from '@/lib/api/api-error';
import { useRegisterClothingMutation } from '@/lib/api/clothing';
import { getFormErrorMessage } from '@/lib/api/error-messages';
import { useEventQuery } from '@/lib/api/events';
import { useUploadPhotoMutation } from '@/lib/api/photos';
import { queryKeys } from '@/lib/api/query-keys';
import { getEventScreenState, getPhotoUploadFailure, isClosed } from '@/lib/event';
import { logger } from '@/lib/logger';
import { compressPhoto } from '@/lib/photo/compress';
import {
  canProceed,
  initialPhotoQueueState,
  nextToStart,
  photoQueueReducer,
} from '@/lib/photo/queue';
import type { PhotoItem } from '@/lib/photo/queue';
import { routes } from '@/lib/routes';
import { hasEventSession } from '@/lib/session';
import type { ClothingDraft, ClothingFieldErrors } from '@/lib/validation/clothing-form';
import type { RegisterClothingBody } from '@/lib/validation/clothing-form';
import {
  buildRegisterClothingBody,
  mapClothingServerFieldErrors,
  measurementFieldsFor,
  validateClothingDraft,
} from '@/lib/validation/clothing-form';
import { MAX_PHOTO_BYTES, validatePhotoFile } from '@/lib/validation/photo';
import type { Event } from '@/types/event';

type PhotoUploadScreenProps = {
  eventId: string;
};

const subscribe = () => () => {};

const FILE_INPUT_ID = 'clothing-photo-input';
const FILE_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
const HELP_TEXT = 'Add up to 10 JPG/JPEG, PNG, or WebP photos. Photos over 10 MB are compressed.';
const MAX_TEXT = 'You have added 10 photos, the maximum.';
const FAILED_SUMMARY = 'Some photos failed to upload. Try again or remove them.';

const EMPTY_DRAFT: ClothingDraft = { title: '', description: '', category: '', measurements: {} };

type FocusedAlertProps = {
  message: string;
  id?: string;
};

function FocusedAlert({ message, id }: FocusedAlertProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <Text type="body" as="p" ref={ref} role="alert" tabIndex={-1} id={id} className="text-error">
      {message}
    </Text>
  );
}

export function PhotoUploadScreen({ eventId }: PhotoUploadScreenProps) {
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
  const registerMutation = useRegisterClothingMutation(eventId);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [queue, dispatch] = useReducer(photoQueueReducer, initialPhotoQueueState);
  const [draft, setDraft] = useState<ClothingDraft>(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<ClothingFieldErrors>({});
  const [registerOutcome, setRegisterOutcome] = useState<RegisterOutcome>('idle');
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);
  const hadUncertainRef = useRef(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [uploadClosed, setUploadClosed] = useState(false);
  const [uploadNoAccess, setUploadNoAccess] = useState(false);
  const [uploadNotFound, setUploadNotFound] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const lastBodyRef = useRef<RegisterClothingBody | null>(null);
  const mountedRef = useRef(true);
  const itemsRef = useRef<PhotoItem[]>([]);
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    itemsRef.current = queue.items;
  }, [queue.items]);

  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch {
          // ignore revoke failures on unmount
        }
      }
      itemsRef.current = [];
    },
    [],
  );

  // Read the cached event during render so the closed view appears in the
  // same commit that updates the cache, without waiting for a re-render.
  const subscribeToCache = useCallback(
    (notify: () => void) => queryClient.getQueryCache().subscribe(notify),
    [queryClient],
  );
  const cachedEvent = useSyncExternalStore(
    subscribeToCache,
    () => queryClient.getQueryData<Event>(queryKeys.event(eventId)),
    () => undefined,
  );
  const liveEvent = cachedEvent ?? data;
  const queueStopped =
    (liveEvent !== undefined && isClosed(liveEvent)) ||
    uploadClosed ||
    uploadNoAccess ||
    uploadNotFound;

  useEffect(() => {
    if (queueStopped) return;
    if (queue.step !== 1) return;
    const next = nextToStart(queue);
    if (!next) return;
    if (inFlightRef.current.has(next.key)) return;
    inFlightRef.current.add(next.key);
    const run = async () => {
      try {
        const needsCompress = next.file.size > MAX_PHOTO_BYTES;
        let fileToUpload = next.file;
        if (needsCompress) {
          dispatch({ type: 'start', key: next.key, status: 'preparing' });
          let compressed: Awaited<ReturnType<typeof compressPhoto>>;
          try {
            compressed = await compressPhoto(next.file);
          } catch {
            compressed = {
              ok: false,
              message: 'This photo is too large. Choose a smaller photo.',
            };
          }
          if (!mountedRef.current) return;
          if (!compressed.ok) {
            try {
              URL.revokeObjectURL(next.previewUrl);
            } catch {
              // ignore
            }
            dispatch({ type: 'failed', key: next.key, message: compressed.message });
            dispatch({ type: 'remove', key: next.key });
            setInputError(compressed.message);
            return;
          }
          fileToUpload = compressed.file;
          if (!mountedRef.current) return;
          dispatch({ type: 'prepared', key: next.key, file: fileToUpload });
        } else {
          dispatch({ type: 'start', key: next.key, status: 'uploading' });
        }
        try {
          const photo = await uploadMutation.mutateAsync(fileToUpload);
          if (!mountedRef.current) return;
          dispatch({ type: 'uploaded', key: next.key, photo });
          setInputError(null);
        } catch (err) {
          if (!mountedRef.current) return;
          if (!(err instanceof ApiError)) logger.error('photo upload failed', err);
          const failure = getPhotoUploadFailure(err);
          if (failure.kind === 'closed') {
            dispatch({
              type: 'failed',
              key: next.key,
              message: err instanceof ApiError ? err.message : 'Event unavailable.',
            });
            setUploadClosed(true);
            void queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId), exact: true });
            return;
          }
          if (failure.kind === 'no-access') {
            dispatch({
              type: 'failed',
              key: next.key,
              message: err instanceof ApiError ? err.message : 'Event unavailable.',
            });
            setUploadNoAccess(true);
            return;
          }
          if (failure.kind === 'not-found') {
            dispatch({ type: 'failed', key: next.key, message: failure.message });
            setUploadNotFound(true);
            return;
          }
          dispatch({ type: 'failed', key: next.key, message: failure.message });
        }
      } finally {
        inFlightRef.current.delete(next.key);
      }
    };
    void run();
    // uploadMutation.mutateAsync is stable; queue and queueStopped drive the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, queueStopped, eventId, queryClient]);

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

  if (uploadNoAccess) {
    return <EventScreenStatus kind="no-access" />;
  }

  if (uploadNotFound) {
    return <EventScreenStatus kind="not-found" />;
  }

  const closed = (liveEvent !== undefined && isClosed(liveEvent)) || uploadClosed;
  const hasFailed = queue.items.some((item) => item.status === 'failed');
  const atLimit = queue.items.length >= 10;
  const proceed = canProceed(queue);

  function openPicker() {
    if (atLimit) return;
    inputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (selected.length === 0) return;
    const free = Math.max(0, 10 - queue.items.length);
    let firstInvalid: string | null = null;
    const valid: { key: string; file: File; previewUrl: string }[] = [];
    for (const file of selected) {
      const result = validatePhotoFile(file);
      if (!result.ok) {
        if (firstInvalid === null) firstInvalid = result.message;
        continue;
      }
      valid.push({
        key: crypto.randomUUID(),
        file: result.file,
        previewUrl: URL.createObjectURL(result.file),
      });
    }
    if (valid.length > 0) {
      dispatch({ type: 'add', items: valid });
      for (const skipped of valid.slice(free)) {
        try {
          URL.revokeObjectURL(skipped.previewUrl);
        } catch {
          // ignore
        }
      }
    }
    setInputError(firstInvalid);
  }

  function handleRemove(key: string) {
    const target = queue.items.find((item) => item.key === key);
    if (!target) return;
    if (target.status === 'preparing' || target.status === 'uploading') return;
    try {
      URL.revokeObjectURL(target.previewUrl);
    } catch {
      // ignore
    }
    dispatch({ type: 'remove', key });
  }

  function handleRetry(key: string) {
    dispatch({ type: 'retry', key });
  }

  function handleRegisterError(error: unknown) {
    if (!(error instanceof ApiError)) {
      setRegisterOutcome('networkError');
      setRegisterMessage(getFormErrorMessage(error));
      hadUncertainRef.current = true;
      return;
    }
    if (error.code === 'VALIDATION_ERROR') {
      const mapped = mapClothingServerFieldErrors(error.details);
      const nextErrors: ClothingFieldErrors = { ...mapped.fieldErrors };
      if (mapped.formError !== null) nextErrors.form = mapped.formError;
      setFieldErrors(nextErrors);
      if (mapped.photoProblem) {
        setRegisterOutcome('photoProblem');
        setRegisterMessage('Some photos can no longer be used. Add your photos again.');
      } else {
        setRegisterOutcome('idle');
        setRegisterMessage(null);
      }
      return;
    }
    if (error.code === 'PHOTO_ALREADY_ATTACHED') {
      if (hadUncertainRef.current) {
        setRegisterOutcome('maybeRegistered');
        setRegisterMessage('Your clothing may already be registered, so it was not sent again.');
      } else {
        setRegisterOutcome('photoProblem');
        setRegisterMessage('Some photos can no longer be used. Add your photos again.');
      }
      return;
    }
    if (error.code === 'NOT_FOUND') {
      setRegisterOutcome('notAvailable');
      setRegisterMessage('This event or some photos are no longer available.');
      return;
    }
    if (error.code === 'EVENT_CLOSED') {
      setUploadClosed(true);
      void queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId), exact: true });
      return;
    }
    if (error.code === 'UNAUTHENTICATED') {
      setUploadNoAccess(true);
      return;
    }
    setRegisterOutcome('networkError');
    setRegisterMessage(getFormErrorMessage(error));
    hadUncertainRef.current = true;
  }

  function submitRegisterBody(body: RegisterClothingBody) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    lastBodyRef.current = body;
    try {
      registerMutation.mutate(body, {
        onSuccess: () => {
          router.replace(`${routes.eventHome(eventId)}?registered=1`);
        },
        onError: handleRegisterError,
        onSettled: () => {
          submittingRef.current = false;
        },
      });
    } catch {
      submittingRef.current = false;
    }
  }

  function handleRegister() {
    if (submittingRef.current || registerMutation.isPending) return;
    const errors = validateClothingDraft(draft);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setRegisterOutcome('idle');
      setRegisterMessage(null);
      return;
    }
    setRegisterOutcome('idle');
    setRegisterMessage(null);
    hadUncertainRef.current = false;
    const photoIds = queue.items.flatMap((item) =>
      item.status === 'ready' && item.photo ? [item.photo.id] : [],
    );
    const body = buildRegisterClothingBody(draft, photoIds);
    submitRegisterBody(body);
  }

  function handleRegisterRetry() {
    const body = lastBodyRef.current;
    if (body === null) return;
    if (submittingRef.current || registerMutation.isPending) return;
    submitRegisterBody(body);
  }

  function handleBackToPhotos() {
    setRegisterOutcome('idle');
    setRegisterMessage(null);
    dispatch({ type: 'back' });
  }

  function handleGoHome() {
    router.push(routes.eventHome(eventId));
  }

  function renderFileControl(disabled: boolean) {
    return (
      <VStack gap={2}>
        <label htmlFor={FILE_INPUT_ID}>Clothing photos</label>
        <input
          ref={inputRef}
          id={FILE_INPUT_ID}
          type="file"
          accept={FILE_ACCEPT}
          multiple
          onChange={handleFileChange}
          disabled={disabled}
          aria-invalid={inputError !== null}
          aria-describedby={inputError !== null ? 'clothing-photo-error' : 'clothing-photo-help'}
        />
        <Text type="body" color="secondary" id="clothing-photo-help">
          {HELP_TEXT}
        </Text>
        {inputError !== null && (
          <FocusedAlert key={inputError} message={inputError} id="clothing-photo-error" />
        )}
      </VStack>
    );
  }

  function renderCarouselMedia(item: PhotoItem) {
    if (item.status === 'ready' && item.photo) {
      return (
        <img
          src={item.photo.url}
          alt="Uploaded clothing photo"
          onError={() => dispatch({ type: 'displayFailed', key: item.key })}
        />
      );
    }
    return <img src={item.previewUrl} alt="Clothing photo preview" />;
  }

  function getCarouselOverlayMedia(item: PhotoItem, index: number) {
    if (item.displayFailed) return null;
    const src = item.status === 'ready' && item.photo ? item.photo.url : item.previewUrl;
    if (!src) return null;
    return { src, alt: `Clothing photo ${index + 1}` };
  }

  function renderCarouselBelow(item: PhotoItem) {
    const locked = item.status === 'preparing' || item.status === 'uploading';
    return (
      <VStack gap={2}>
        {item.status === 'ready' && item.displayFailed && (
          <Text type="body">This photo could not be displayed.</Text>
        )}
        {item.status === 'waiting' && <Text type="body">Waiting</Text>}
        {item.status === 'preparing' && (
          <Text type="body" role="status">
            Preparing photo…
          </Text>
        )}
        {item.status === 'uploading' && (
          <Text type="body" role="status">
            Uploading photo…
          </Text>
        )}
        {item.status === 'failed' && item.error && (
          <FocusedAlert key={`${item.key}-${item.error}`} message={item.error} />
        )}
        {item.status === 'failed' && (
          <Button
            label="Try again"
            variant="primary"
            size="lg"
            width="100%"
            onClick={() => handleRetry(item.key)}
          />
        )}
        <Button
          label="Remove"
          variant="ghost"
          size="lg"
          width="100%"
          isDisabled={locked}
          onClick={() => handleRemove(item.key)}
        />
      </VStack>
    );
  }

  function renderClosedCarouselBelow(item: PhotoItem) {
    if (item.status === 'ready' && item.displayFailed) {
      return <Text type="body">This photo could not be displayed.</Text>;
    }
    return null;
  }

  if (closed) {
    return (
      <VStack gap={4} padding={6}>
        <Heading level={1}>Register clothing</Heading>
        <Text type="body">Step 1 of 2: Photos</Text>
        {renderFileControl(true)}
        <Text type="body">
          {queue.items.length} / 10 photos
        </Text>
        <PhotoCarousel
          items={queue.items}
          renderMedia={renderCarouselMedia}
          renderBelow={renderClosedCarouselBelow}
          getOverlayMedia={getCarouselOverlayMedia}
        />
      </VStack>
    );
  }

  if (queue.step === 2) {
    return (
      <VStack gap={4} padding={6}>
        <Heading level={1}>Register clothing</Heading>
        <Text type="body">Step 2 of 2: Details</Text>
        <ClothingDetailsForm
          draft={draft}
          errors={fieldErrors}
          isPending={registerMutation.isPending}
          outcome={registerOutcome}
          outcomeMessage={registerMessage}
          onDraftChange={(next, field) => {
            setDraft(next);
            setFieldErrors((prev) => {
              const nextErrors = { ...prev };
              let changed = false;
              if (nextErrors[field] !== undefined) {
                delete nextErrors[field];
                changed = true;
              }
              if (nextErrors.form !== undefined) {
                delete nextErrors.form;
                changed = true;
              }
              if (field === 'category') {
                const allowed = new Set<string>(measurementFieldsFor(next.category));
                for (const key of Object.keys(nextErrors)) {
                  if (key === 'title' || key === 'description' || key === 'category' || key === 'form')
                    continue;
                  if (!allowed.has(key)) {
                    delete nextErrors[key as keyof typeof nextErrors];
                    changed = true;
                  }
                }
              }
              return changed ? nextErrors : prev;
            });
          }}
          onSubmit={handleRegister}
          onBack={() => dispatch({ type: 'back' })}
          onBackToPhotos={handleBackToPhotos}
          onGoHome={handleGoHome}
          onRetry={handleRegisterRetry}
        />
      </VStack>
    );
  }

  return (
    <VStack gap={4} padding={6}>
      <Heading level={1}>Register clothing</Heading>
      <Text type="body">Step 1 of 2: Photos</Text>
      {renderFileControl(atLimit)}
      <Text type="body">
        {queue.items.length} / 10 photos
      </Text>
      {atLimit && <Text type="body">{MAX_TEXT}</Text>}
      {queue.lastSkipped > 0 && (
        <Text type="body">
          {queue.lastSkipped} photos were not added because the limit is 10.
        </Text>
      )}
      {hasFailed && <Text type="body">{FAILED_SUMMARY}</Text>}
      <PhotoCarousel
        items={queue.items}
        renderMedia={renderCarouselMedia}
        renderBelow={renderCarouselBelow}
        getOverlayMedia={getCarouselOverlayMedia}
      />
      <Button
        label="Add photo"
        variant="secondary"
        size="lg"
        width="100%"
        isDisabled={atLimit}
        onClick={openPicker}
      />
      <Button
        label="Next"
        variant="primary"
        size="lg"
        width="100%"
        isDisabled={!proceed}
        onClick={() => dispatch({ type: 'next' })}
      />
    </VStack>
  );
}
