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

type Preset = { label: string; min: number; max: number };

const PRESETS: Record<MeasurementField, Preset[]> = {
  totalLength: [
    { label: 'Short 24–26', min: 24, max: 26 },
    { label: 'Regular 27–29', min: 27, max: 29 },
    { label: 'Long 30–32', min: 30, max: 32 },
  ],
  chest: [
    { label: 'Slim 34–36', min: 34, max: 36 },
    { label: 'Regular 38–40', min: 38, max: 40 },
    { label: 'Relaxed 42–44', min: 42, max: 44 },
  ],
  shoulder: [
    { label: 'Narrow 16–17', min: 16, max: 17 },
    { label: 'Regular 18–19', min: 18, max: 19 },
    { label: 'Broad 20–21', min: 20, max: 21 },
  ],
  sleeve: [
    { label: 'Short 31–32', min: 31, max: 32 },
    { label: 'Regular 33–34', min: 33, max: 34 },
    { label: 'Long 35–36', min: 35, max: 36 },
  ],
  waist: [
    { label: 'Slim 28–30', min: 28, max: 30 },
    { label: 'Regular 32–34', min: 32, max: 34 },
    { label: 'Relaxed 36–38', min: 36, max: 38 },
  ],
  hem: [
    { label: 'Slim 36–38', min: 36, max: 38 },
    { label: 'Regular 40–42', min: 40, max: 42 },
    { label: 'Relaxed 44–46', min: 44, max: 46 },
  ],
  inseam: [
    { label: 'Short 28–30', min: 28, max: 30 },
    { label: 'Regular 31–32', min: 31, max: 32 },
    { label: 'Long 33–34', min: 33, max: 34 },
  ],
  thigh: [
    { label: 'Slim 22–23', min: 22, max: 23 },
    { label: 'Regular 24–25', min: 24, max: 25 },
    { label: 'Relaxed 26–27', min: 26, max: 27 },
  ],
};

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

function draftNeedsCustom(draft: RangeDraft | undefined, presets: Preset[]): boolean {
  if (draft === undefined) return false;
  if (draft.min.trim() === '' && draft.max.trim() === '') return false;
  return !presets.some(
    (preset) => draft.min.trim() === String(preset.min) && draft.max.trim() === String(preset.max),
  );
}

function initialActiveField(
  category: ClothingCategory | null,
  draft: Partial<Record<MeasurementField, RangeDraft>>,
): MeasurementField | null {
  if (category === null) return null;
  const fields = measurementFieldsFor(category);
  if (fields.length === 0) return null;
  const withValue = fields.find(
    (field) =>
      (draft[field]?.min.trim() ?? '') !== '' || (draft[field]?.max.trim() ?? '') !== '',
  );
  return withValue ?? null;
}

function fieldChipLabel(field: MeasurementField, draft: RangeDraft | undefined): string {
  const label = MEASUREMENT_LABELS[field];
  const min = draft?.min.trim() ?? '';
  const max = draft?.max.trim() ?? '';
  if (min !== '' && max !== '') return `${label} ${min}–${max}`;
  if (min !== '') return `${label} ≥ ${min}`;
  if (max !== '') return `${label} ≤ ${max}`;
  return label;
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
  const [activeField, setActiveField] = useState<MeasurementField | null>(() =>
    initialActiveField(conditions.category, toDraft(conditions)),
  );
  const [customOpen, setCustomOpen] = useState(false);

  // Prefill the draft each time the sheet opens.
  const [prefilledOpen, setPrefilledOpen] = useState(isOpen);
  if (prefilledOpen !== isOpen) {
    setPrefilledOpen(isOpen);
    if (isOpen) {
      const draft = toDraft(conditions);
      setCategory(conditions.category);
      setColors(conditions.colors);
      setRanges(draft);
      setError(null);
      const active = initialActiveField(conditions.category, draft);
      setActiveField(active);
      setCustomOpen(active !== null && draftNeedsCustom(draft[active], PRESETS[active]));
    }
  }

  const fields: MeasurementField[] =
    category === null ? [] : measurementFieldsFor(category);

  function handleCategoryChange(next: ClothingCategory | null) {
    setCategory(next);
    setActiveField(null);
    setCustomOpen(false);
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

  function handleFieldChange(field: MeasurementField, isPressed: boolean) {
    if (!isPressed) {
      setActiveField(null);
      setCustomOpen(false);
      return;
    }
    setActiveField(field);
    const draft = ranges[field];
    setCustomOpen(draftNeedsCustom(draft, PRESETS[field]));
  }

  function handlePresetChange(field: MeasurementField, preset: Preset, isPressed: boolean) {
    setRanges((prev) => {
      if (!isPressed) {
        const next = { ...prev };
        delete next[field];
        return next;
      }
      return { ...prev, [field]: { min: String(preset.min), max: String(preset.max) } };
    });
    setCustomOpen(false);
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
          {category === null ? (
            <Text type="body" color="secondary">
              Choose a category to narrow by size.
            </Text>
          ) : fields.length === 0 ? (
            <Text type="body" color="secondary">
              No measurements needed for this category.
            </Text>
          ) : (
            <VStack gap={2}>
              <HStack gap={2} wrap="wrap">
                {fields.map((field) => (
                  <ToggleButton
                    key={field}
                    label={fieldChipLabel(field, ranges[field])}
                    size="lg"
                    isPressed={activeField === field}
                    onPressedChange={(isPressed) => handleFieldChange(field, isPressed)}
                  />
                ))}
              </HStack>
              {activeField !== null && (
                <VStack gap={2}>
                  <HStack gap={2} wrap="wrap">
                    {PRESETS[activeField].map((preset) => {
                      const draft = ranges[activeField];
                      const isPressed =
                        draft?.min.trim() === String(preset.min) &&
                        draft?.max.trim() === String(preset.max);
                      return (
                        <ToggleButton
                          key={preset.label}
                          label={preset.label}
                          size="lg"
                          isPressed={isPressed}
                          onPressedChange={(isPressed) =>
                            handlePresetChange(activeField, preset, isPressed)
                          }
                        />
                      );
                    })}
                    <ToggleButton
                      label="Custom"
                      size="lg"
                      isPressed={customOpen}
                      onPressedChange={setCustomOpen}
                    />
                  </HStack>
                  {customOpen && (
                    <HStack gap={2}>
                      <StackItem size="fill">
                        <TextInput
                          label={`${MEASUREMENT_LABELS[activeField]} min (in)`}
                          value={ranges[activeField]?.min ?? ''}
                          onChange={(value) =>
                            setRanges((prev) => ({
                              ...prev,
                              [activeField]: { min: value, max: prev[activeField]?.max ?? '' },
                            }))
                          }
                        />
                      </StackItem>
                      <StackItem size="fill">
                        <TextInput
                          label={`${MEASUREMENT_LABELS[activeField]} max (in)`}
                          value={ranges[activeField]?.max ?? ''}
                          onChange={(value) =>
                            setRanges((prev) => ({
                              ...prev,
                              [activeField]: { min: prev[activeField]?.min ?? '', max: value },
                            }))
                          }
                        />
                      </StackItem>
                    </HStack>
                  )}
                </VStack>
              )}
            </VStack>
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
