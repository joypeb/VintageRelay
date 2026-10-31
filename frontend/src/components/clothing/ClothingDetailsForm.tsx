'use client';

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

type ClothingDetailsFormProps = {
  draft: ClothingDraft;
  errors: ClothingFieldErrors;
  isPending: boolean;
  onDraftChange: (draft: ClothingDraft) => void;
  onSubmit: () => void;
  onBack: () => void;
};

export function ClothingDetailsForm({
  draft,
  errors,
  isPending,
  onDraftChange,
  onSubmit,
  onBack,
}: ClothingDetailsFormProps) {
  const fields = measurementFieldsFor(draft.category);

  function handleCategoryChange(value: string) {
    const category = value as ClothingCategoryValue;
    onDraftChange({ ...draft, category, measurements: pruneMeasurements(category, draft.measurements) });
  }

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <TextInput
          label="Title"
          value={draft.title}
          onChange={(value) => onDraftChange({ ...draft, title: value })}
          status={errors.title ? { type: 'error', message: errors.title } : undefined}
        />
        <Text type="body" color="secondary">
          {`${codePointLength(draft.title)} / 100`}
        </Text>
      </VStack>
      <VStack gap={2}>
        <TextArea
          label="Description"
          value={draft.description}
          onChange={(value) => onDraftChange({ ...draft, description: value })}
          status={errors.description ? { type: 'error', message: errors.description } : undefined}
        />
        <Text type="body" color="secondary">
          {`${codePointLength(draft.description)} / 1,000`}
        </Text>
      </VStack>
      <Selector
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
              label={`${MEASUREMENT_LABELS[field]} (in)`}
              value={draft.measurements[field] ?? ''}
              onChange={(value) =>
                onDraftChange({ ...draft, measurements: { ...draft.measurements, [field]: value } })
              }
              status={errors[field] ? { type: 'error', message: errors[field] } : undefined}
            />
          ))
        )}
      </VStack>
      <Button
        label={isPending ? 'Registering…' : 'Register'}
        variant="primary"
        size="lg"
        width="100%"
        isDisabled={isPending}
        onClick={onSubmit}
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
