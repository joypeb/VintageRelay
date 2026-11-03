'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Link } from '@astryxdesign/core/Link';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';

import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { ApiError } from '@/lib/api/api-error';
import { useClothingQuery, useUpdateClothingMutation } from '@/lib/api/clothing';
import { getFormErrorMessage } from '@/lib/api/error-messages';
import { routes } from '@/lib/routes';
import { hasEventSession } from '@/lib/session';
import type {
  ClothingCategoryValue,
  ClothingDraft,
  ClothingFieldErrors,
  MeasurementField,
} from '@/lib/validation/clothing-form';
import {
  CATEGORY_OPTIONS,
  MEASUREMENT_LABELS,
  buildUpdateClothingBody,
  mapClothingServerFieldErrors,
  measurementFieldsFor,
  pruneMeasurements,
  validateClothingDraft,
} from '@/lib/validation/clothing-form';
import type { Clothing } from '@/types/clothing';

const subscribe = () => () => {};

function toDraft(clothing: Clothing): ClothingDraft {
  const measurements: ClothingDraft['measurements'] = {};
  if (clothing.measurements) {
    for (const [field, value] of Object.entries(clothing.measurements)) {
      if (value !== null && value !== undefined) {
        measurements[field as MeasurementField] = String(value);
      }
    }
  }
  return {
    title: clothing.title,
    description: clothing.description,
    category: clothing.category as ClothingCategoryValue,
    measurements,
  };
}

export function EditClothingForm({
  eventId,
  clothingId,
}: {
  eventId: string;
  clothingId: string;
}) {
  const isMounted = useSyncExternalStore(subscribe, () => true, () => false);
  const hasSession = isMounted && hasEventSession(eventId);
  const { data, error, isPending, isFetching, refetch } = useClothingQuery(eventId, clothingId, {
    enabled: hasSession,
  });
  const update = useUpdateClothingMutation(eventId, clothingId);
  const router = useRouter();

  const [draft, setDraft] = useState<ClothingDraft | null>(() =>
    data ? toDraft(data) : null,
  );
  const [fieldErrors, setFieldErrors] = useState<ClothingFieldErrors>({});
  const initializedFor = useRef<string | null>(data ? data.id : null);

  useEffect(() => {
    if (data && initializedFor.current !== data.id) {
      initializedFor.current = data.id;
      setDraft(toDraft(data));
      setFieldErrors({});
    }
  }, [data]);

  if (!isMounted) return null;

  if (!hasSession) {
    return <EventScreenStatus kind="no-access" />;
  }

  if (isPending) {
    return (
      <section aria-busy="true" aria-label="Loading clothing">
        <VStack gap={4} padding={6}>
          <Text type="body">Loading…</Text>
        </VStack>
      </section>
    );
  }

  if (error) {
    return (
      <EventScreenStatus
        kind="error"
        message={getFormErrorMessage(error)}
        isLoading={isFetching}
        onRetry={() => void refetch()}
      />
    );
  }

  if (!data || !draft) {
    return (
      <VStack gap={4} padding={6}>
        <Text type="body">This clothing item could not be found.</Text>
      </VStack>
    );
  }

  const fields = measurementFieldsFor(draft.category);

  function updateDraft(next: ClothingDraft, field: keyof ClothingFieldErrors) {
    setDraft(next);
    setFieldErrors((prev) => {
      if (prev[field] === undefined && prev.form === undefined) return prev;
      const nextErrors = { ...prev };
      delete nextErrors[field];
      if (field !== 'form') delete nextErrors.form;
      if (field === 'category') {
        const allowed = new Set<string>(measurementFieldsFor(next.category));
        for (const key of Object.keys(nextErrors)) {
          if (key === 'title' || key === 'description' || key === 'category' || key === 'form')
            continue;
          if (!allowed.has(key)) delete nextErrors[key as keyof ClothingFieldErrors];
        }
      }
      return nextErrors;
    });
  }

  async function handleSave() {
    if (update.isPending) return;
    const currentDraft = draft;
    const currentData = data;
    if (!currentDraft || !currentData) return;
    const errors = validateClothingDraft(currentDraft);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    const body = buildUpdateClothingBody(
      currentDraft,
      currentData.photos.map((photo) => photo.id),
    );
    try {
      await update.mutateAsync(body);
      router.push(`${routes.myItemDetail(eventId, clothingId)}?saved=1`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        const mapped = mapClothingServerFieldErrors(err.details);
        const nextErrors: ClothingFieldErrors = { ...mapped.fieldErrors };
        if (mapped.formError !== null) nextErrors.form = mapped.formError;
        setFieldErrors(nextErrors);
        return;
      }
      setFieldErrors({ form: getFormErrorMessage(err) });
    }
  }

  return (
    <VStack gap={4} padding={6}>
      <Heading level={1}>Edit item</Heading>
      <Text type="body">Editing this item invalidates its unconfirmed proposals. Confirmed exchanges stay as they are.</Text>
      <Text type="body">Photos (view only in this version)</Text>
      {data.photos.map((photo, index) => (
        <img key={photo.id} src={photo.url} alt={`${data.title} photo ${index + 1}`} />
      ))}
      <TextInput
        label="Title"
        value={draft.title}
        onChange={(value) => updateDraft({ ...draft, title: value }, 'title')}
        status={fieldErrors.title ? { type: 'error', message: fieldErrors.title } : undefined}
      />
      <TextArea
        label="Description"
        value={draft.description}
        onChange={(value) => updateDraft({ ...draft, description: value }, 'description')}
        status={
          fieldErrors.description
            ? { type: 'error', message: fieldErrors.description }
            : undefined
        }
      />
      <Selector
        label="Category"
        options={CATEGORY_OPTIONS}
        value={draft.category === '' ? undefined : draft.category}
        onChange={(value) =>
          updateDraft(
            {
              ...draft,
              category: value as ClothingCategoryValue,
              measurements: pruneMeasurements(value as ClothingCategoryValue, draft.measurements),
            },
            'category',
          )
        }
        placeholder="Choose a category"
        status={fieldErrors.category ? { type: 'error', message: fieldErrors.category } : undefined}
      />
      {fields.map((field) => (
        <TextInput
          key={field}
          label={`${MEASUREMENT_LABELS[field]} (in)`}
          value={draft.measurements[field] ?? ''}
          onChange={(value) =>
            updateDraft(
              { ...draft, measurements: { ...draft.measurements, [field]: value } },
              field,
            )
          }
          status={fieldErrors[field] ? { type: 'error', message: fieldErrors[field] } : undefined}
        />
      ))}
      {fieldErrors.form !== undefined && (
        <Text type="body" as="p">
          <span role="alert">{fieldErrors.form}</span>
        </Text>
      )}
      <Button
        label={update.isPending ? 'Saving…' : 'Save'}
        variant="primary"
        size="lg"
        width="100%"
        isLoading={update.isPending}
        isDisabled={update.isPending}
        onClick={() => void handleSave()}
      />
      <Link href={routes.myItemDetail(eventId, clothingId)} isStandalone>
        Cancel
      </Link>
    </VStack>
  );
}
