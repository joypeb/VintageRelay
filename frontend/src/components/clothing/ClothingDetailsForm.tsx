'use client';

import { useRef } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';

import type {
  ClothingCategoryValue,
  ClothingDraft,
  ClothingFieldErrors,
  MeasurementField,
} from '@/lib/validation/clothing-form';
import {
  codePointLength,
  measurementFieldsFor,
  pruneMeasurements,
  validateClothingDraft,
} from '@/lib/validation/clothing-form';

const MEASUREMENT_LABELS: Record<MeasurementField, string> = {
  totalLength: 'Total length',
  chest: 'Chest',
  shoulder: 'Shoulder',
  sleeve: 'Sleeve',
  waist: 'Waist',
  hem: 'Hem',
  inseam: 'Inseam',
  thigh: 'Thigh',
};

const CATEGORY_OPTIONS = [
  { value: 'top', label: 'Top' },
  { value: 'outer', label: 'Outer' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'other', label: 'Other' },
];

export type RegisterOutcome =
  | 'idle'
  | 'photoProblem'
  | 'notAvailable'
  | 'maybeRegistered'
  | 'networkError';

export type ClothingDetailsField = 'title' | 'description' | 'category' | MeasurementField;

type ClothingDetailsFormProps = {
  draft: ClothingDraft;
  errors: ClothingFieldErrors;
  isPending: boolean;
  outcome: RegisterOutcome;
  outcomeMessage: string | null;
  onDraftChange: (draft: ClothingDraft, field: ClothingDetailsField) => void;
  onSubmit: () => void;
  onBack: () => void;
  onBackToPhotos: () => void;
  onGoHome: () => void;
  onRetry: () => void;
};

export function ClothingDetailsForm({
  draft,
  errors,
  isPending,
  outcome,
  outcomeMessage,
  onDraftChange,
  onSubmit,
  onBack,
  onBackToPhotos,
  onGoHome,
  onRetry,
}: ClothingDetailsFormProps) {
  const fields = measurementFieldsFor(draft.category);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const categoryRef = useRef<HTMLButtonElement>(null);
  const measurementRefs = useRef<Partial<Record<MeasurementField, HTMLInputElement | null>>>({});

  function handleCategoryChange(value: string) {
    const category = value as ClothingCategoryValue;
    onDraftChange({ ...draft, category, measurements: pruneMeasurements(category, draft.measurements) }, 'category');
  }

  function focusFirstClientError() {
    const clientErrors = validateClothingDraft(draft);
    if (clientErrors.title !== undefined) {
      titleRef.current?.focus();
      return;
    }
    if (clientErrors.description !== undefined) {
      descriptionRef.current?.focus();
      return;
    }
    if (clientErrors.category !== undefined) {
      categoryRef.current?.focus();
      return;
    }
    for (const field of fields) {
      if (clientErrors[field] !== undefined) {
        measurementRefs.current[field]?.focus();
        return;
      }
    }
  }

  function handleRegisterClick() {
    focusFirstClientError();
    onSubmit();
  }

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <TextInput
          ref={titleRef}
          label="Title"
          value={draft.title}
          onChange={(value) => onDraftChange({ ...draft, title: value }, 'title')}
          status={errors.title ? { type: 'error', message: errors.title } : undefined}
        />
        <Text type="body" color="secondary">
          {`${codePointLength(draft.title)} / 100`}
        </Text>
      </VStack>
      <VStack gap={2}>
        <TextArea
          ref={descriptionRef}
          label="Description"
          value={draft.description}
          onChange={(value) => onDraftChange({ ...draft, description: value }, 'description')}
          status={errors.description ? { type: 'error', message: errors.description } : undefined}
        />
        <Text type="body" color="secondary">
          {`${codePointLength(draft.description)} / 1,000`}
        </Text>
      </VStack>
      <Selector
        ref={categoryRef}
        label="Category"
        options={CATEGORY_OPTIONS}
        value={draft.category === '' ? undefined : draft.category}
        onChange={handleCategoryChange}
        placeholder="Choose a category"
        status={errors.category ? { type: 'error', message: errors.category } : undefined}
      />
      <VStack gap={2}>
        <Text type="body">Measurements (optional, inches)</Text>
        {fields.length === 0 ? (
          <Text type="body" color="secondary">
            {draft.category === '' ? 'Choose a category first.' : 'No measurements needed for this category.'}
          </Text>
        ) : (
          fields.map((field) => (
            <TextInput
              key={field}
              ref={(element) => {
                measurementRefs.current[field] = element;
              }}
              label={`${MEASUREMENT_LABELS[field]} (in)`}
              value={draft.measurements[field] ?? ''}
              onChange={(value) =>
                onDraftChange({ ...draft, measurements: { ...draft.measurements, [field]: value } }, field)
              }
              status={errors[field] ? { type: 'error', message: errors[field] } : undefined}
            />
          ))
        )}
      </VStack>
      {errors.form !== undefined && (
        <Text type="body" as="p">
          <span role="alert" className="text-[var(--color-error)]">
            {errors.form}
          </span>
        </Text>
      )}
      {outcome !== 'idle' && outcomeMessage !== null && (
        <Text type="body" as="p">
          <span role="alert" className="text-[var(--color-error)]">
            {outcomeMessage}
          </span>
        </Text>
      )}
      {outcome === 'photoProblem' && (
        <Button
          label="Back to photos"
          variant="secondary"
          size="lg"
          width="100%"
          onClick={onBackToPhotos}
        />
      )}
      {outcome === 'notAvailable' && (
        <VStack gap={2}>
          <Button
            label="Back to photos"
            variant="secondary"
            size="lg"
            width="100%"
            onClick={onBackToPhotos}
          />
          <Button label="Go to event home" variant="secondary" size="lg" width="100%" onClick={onGoHome} />
        </VStack>
      )}
      {outcome === 'maybeRegistered' && (
        <Button label="Go to event home" variant="secondary" size="lg" width="100%" onClick={onGoHome} />
      )}
      {outcome === 'networkError' && (
        <Button label="Try again" variant="primary" size="lg" width="100%" onClick={onRetry} />
      )}
      <Button
        label={isPending ? 'Registering…' : 'Register'}
        variant="primary"
        size="lg"
        width="100%"
        isLoading={isPending}
        isDisabled={isPending}
        onClick={handleRegisterClick}
      />
      <Button
        label="Back"
        variant="secondary"
        size="lg"
        width="100%"
        isDisabled={isPending}
        onClick={onBack}
      />
    </VStack>
  );
}
