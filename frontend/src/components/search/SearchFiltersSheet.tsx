'use client';

import { useState } from 'react';

import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { VStack } from '@astryxdesign/core/VStack';

import { SEARCH_COLORS, colorLabel, validateFilters, withCategory } from '@/lib/search/conditions';
import {
  CATEGORY_OPTIONS,
  MEASUREMENT_LABELS,
  measurementFieldsFor,
  type MeasurementField,
} from '@/lib/validation/clothing-form';
import type { ClothingCategory, ClothingColor } from '@/types/clothing';
import type { SearchConditions } from '@/types/search';

type RangeDraft = { min: string; max: string };

const ALL_FIELDS = Object.keys(MEASUREMENT_LABELS) as MeasurementField[];

const FILTER_ERROR = 'Enter a range from 0.1 to 120 with min ≤ max.';

function toDraft(conditions: SearchConditions): Partial<Record<MeasurementField, RangeDraft>> {
  const draft: Partial<Record<MeasurementField, RangeDraft>> = {};
  for (const [name, range] of Object.entries(conditions.measurements)) {
    if (range === undefined) continue;
    draft[name as MeasurementField] = {
      min: range.min !== undefined ? String(range.min) : '',
      max: range.max !== undefined ? String(range.max) : '',
    };
  }
  return draft;
}

function parseBound(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  return Number(trimmed);
}

export function SearchFiltersSheet({
  isOpen,
  onOpenChange,
  conditions,
  onApply,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  conditions: SearchConditions;
  onApply: (next: SearchConditions) => void;
}) {
  const [category, setCategory] = useState<ClothingCategory | null>(conditions.category);
  const [colors, setColors] = useState<ClothingColor[]>(conditions.colors);
  const [ranges, setRanges] = useState<Partial<Record<MeasurementField, RangeDraft>>>(() =>
    toDraft(conditions),
  );
  const [error, setError] = useState<string | null>(null);

  // Prefill the draft each time the sheet opens.
  const [prefilledOpen, setPrefilledOpen] = useState(isOpen);
  if (prefilledOpen !== isOpen) {
    setPrefilledOpen(isOpen);
    if (isOpen) {
      setCategory(conditions.category);
      setColors(conditions.colors);
      setRanges(toDraft(conditions));
      setError(null);
    }
  }

  const fields: MeasurementField[] = category === null ? ALL_FIELDS : measurementFieldsFor(category);

  function handleCategoryChange(next: ClothingCategory | null) {
    setCategory(next);
    // Same as withCategory: changing category drops ranges outside its fields.
    if (next === null) return;
    const allowed = new Set<MeasurementField>(measurementFieldsFor(next));
    setRanges((prev) => {
      const kept: Partial<Record<MeasurementField, RangeDraft>> = {};
      for (const [name, draft] of Object.entries(prev)) {
        if (draft !== undefined && allowed.has(name as MeasurementField)) {
          kept[name as MeasurementField] = draft;
        }
      }
      return kept;
    });
  }

  function toggleColor(color: ClothingColor) {
    setColors((prev) => (prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]));
  }

  function handleApply() {
    const measurements: SearchConditions['measurements'] = {};
    for (const [name, draft] of Object.entries(ranges)) {
      if (draft === undefined) continue;
      const min = parseBound(draft.min);
      const max = parseBound(draft.max);
      if (min === undefined && max === undefined) continue;
      measurements[name as MeasurementField] = {
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
      };
    }
    const next: SearchConditions = {
      category,
      colors,
      measurements,
      keywords: conditions.keywords,
      unrecognized: conditions.unrecognized,
    };
    // Drop ranges the sheet never shows (e.g. from AI/URL), like withCategory does.
    const pruned = withCategory(next, category);
    if (!validateFilters(pruned)) {
      setError(FILTER_ERROR);
      return;
    }
    setError(null);
    onApply(pruned);
  }

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" label="Search filters">
      <VStack gap={4}>
        <VStack gap={2}>
          <Text type="body">Category</Text>
          <HStack gap={2} wrap="wrap">
            {CATEGORY_OPTIONS.map((option) => (
              <ToggleButton
                key={option.value}
                label={option.label}
                size="lg"
                isPressed={category === option.value}
                onPressedChange={(isPressed) =>
                  handleCategoryChange(isPressed ? (option.value as ClothingCategory) : null)
                }
              />
            ))}
          </HStack>
        </VStack>
        <VStack gap={2}>
          <Text type="body">Colors</Text>
          <HStack gap={2} wrap="wrap">
            {SEARCH_COLORS.map((color) => (
              <ToggleButton
                key={color}
                label={colorLabel(color)}
                size="lg"
                isPressed={colors.includes(color)}
                onPressedChange={() => toggleColor(color)}
              />
            ))}
          </HStack>
        </VStack>
        <VStack gap={2}>
          <Text type="body">Measurements (inches)</Text>
          {fields.length === 0 ? (
            <Text type="body" color="secondary">
              No measurements needed for this category.
            </Text>
          ) : (
            fields.map((field) => (
              <HStack key={field} gap={2}>
                <StackItem size="fill">
                  <TextInput
                    label={`${MEASUREMENT_LABELS[field]} min (in)`}
                    value={ranges[field]?.min ?? ''}
                    onChange={(value) =>
                      setRanges((prev) => ({
                        ...prev,
                        [field]: { min: value, max: prev[field]?.max ?? '' },
                      }))
                    }
                  />
                </StackItem>
                <StackItem size="fill">
                  <TextInput
                    label={`${MEASUREMENT_LABELS[field]} max (in)`}
                    value={ranges[field]?.max ?? ''}
                    onChange={(value) =>
                      setRanges((prev) => ({
                        ...prev,
                        [field]: { min: prev[field]?.min ?? '', max: value },
                      }))
                    }
                  />
                </StackItem>
              </HStack>
            ))
          )}
        </VStack>
        {error !== null && (
          // Astryx layout components don't forward aria attributes, so a minimal element marks the live region.
          <section role="alert">
            <Text type="body">{error}</Text>
          </section>
        )}
        <Button label="Apply" variant="primary" size="lg" width="100%" onClick={handleApply} />
        <Button
          label="Cancel"
          variant="ghost"
          size="lg"
          width="100%"
          onClick={() => onOpenChange(false)}
        />
      </VStack>
    </BottomSheet>
  );
}
