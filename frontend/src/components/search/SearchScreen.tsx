'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';

import { ClothingCard } from '@/components/clothing/HomeClothingGrid';
import { EventScreenStatus } from '@/components/event/EventScreenStatus';
import { SearchFiltersSheet } from '@/components/search/SearchFiltersSheet';
import { ApiError } from '@/lib/api/api-error';
import { getFormErrorMessage } from '@/lib/api/error-messages';
import { useClothingSearch, useInterpretSearch } from '@/lib/api/search';
import {
  conditionCount,
  colorLabel,
  parseSearchParams,
  removeCondition,
  toSearchParams,
  validateQuery,
} from '@/lib/search/conditions';
import { hasEventSession } from '@/lib/session';
import { CATEGORY_OPTIONS, MEASUREMENT_LABELS } from '@/lib/validation/clothing-form';
import type { ClothingCategory, ClothingColor } from '@/types/clothing';
import type {
  MeasurementRange,
  SearchConditions,
  SearchResultItem,
} from '@/types/search';

const subscribe = () => () => {};

const AI_UNAVAILABLE_MESSAGE = 'Search could not understand that right now. Choose filters instead.';

function formatMeasurementLabel(
  name: keyof SearchConditions['measurements'],
  range: MeasurementRange,
): string {
  const label = MEASUREMENT_LABELS[name as keyof typeof MEASUREMENT_LABELS];
  if (range.min !== undefined && range.max !== undefined) {
    return `${label} ${range.min}–${range.max} in`;
  }
  if (range.min !== undefined) return `${label} ≥ ${range.min} in`;
  return `${label} ≤ ${range.max} in`;
}

function categoryLabel(category: ClothingCategory): string {
  return CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
}

function badgeFor(item: SearchResultItem, total: number): ReactNode {
  if (total === 0) return null;
  const label = `${item.matchCount}/${total} match${item.missingMeasurements ? ' · No measurements' : ''}`;
  return (
    <Text type="body" color="secondary">
      {label}
    </Text>
  );
}

export function SearchScreen({ eventId }: { eventId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // localStorage is unavailable during SSR, so read the session only after mount.
  const isMounted = useSyncExternalStore(subscribe, () => true, () => false);

  const { q, conditions } = useMemo(() => parseSearchParams(searchParams), [searchParams]);
  const total = conditionCount(conditions);
  const measurementEntries = useMemo(
    () => Object.entries(conditions.measurements),
    [conditions.measurements],
  );

  const [text, setText] = useState(q);
  // Keep the draft in sync when the URL query changes (e.g. back navigation).
  const [syncedQ, setSyncedQ] = useState(q);
  if (syncedQ !== q) {
    setSyncedQ(q);
    setText(q);
  }
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [aiFallback, setAiFallback] = useState(false);
  const [interpretError, setInterpretError] = useState<string | null>(null);

  const interpret = useInterpretSearch(eventId);
  const ranked = useClothingSearch(eventId, conditions, {
    enabled: isMounted && hasEventSession(eventId),
  });

  function replaceUrl(nextQ: string, next: SearchConditions) {
    const query = toSearchParams(nextQ, next).toString();
    router.replace(query === '' ? pathname : `${pathname}?${query}`);
  }

  function clearInterpretErrors() {
    setAiFallback(false);
    setInterpretError(null);
  }

  function handleSubmit() {
    if (interpret.isPending) return;
    const trimmed = text.trim();
    if (!validateQuery(text)) return;
    clearInterpretErrors();
    interpret.mutate(trimmed, {
      onSuccess: (next) => replaceUrl(trimmed, next),
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'AI_UNAVAILABLE') {
          setAiFallback(true);
        } else {
          setInterpretError(getFormErrorMessage(error));
        }
      },
    });
  }

  function handleRemove(target: Parameters<typeof removeCondition>[1]) {
    clearInterpretErrors();
    replaceUrl(q, removeCondition(conditions, target));
  }

  function handleApplyFilters(next: SearchConditions) {
    clearInterpretErrors();
    setFiltersOpen(false);
    replaceUrl(q, next);
  }

  if (!isMounted) return null;
  if (!hasEventSession(eventId)) {
    return <EventScreenStatus kind="no-access" />;
  }

  const hasChips =
    conditions.category !== null || conditions.colors.length > 0 || measurementEntries.length > 0;

  function renderResults() {
    if (ranked.isPending) {
      // Astryx layout components don't forward aria attributes, so a minimal element marks the busy region.
      return (
        <section aria-label="Loading search results" aria-busy="true">
          <Grid columns={2} gap={4}>
            <AspectRatio ratio={3 / 4}>
              <Skeleton height="100%" />
            </AspectRatio>
            <AspectRatio ratio={3 / 4}>
              <Skeleton height="100%" />
            </AspectRatio>
          </Grid>
        </section>
      );
    }
    if (ranked.error) {
      return (
        <EventScreenStatus
          kind="error"
          message={ranked.error.message || 'Could not load search results.'}
          isLoading={ranked.isFetching}
          onRetry={() => void ranked.refetch()}
        />
      );
    }
    const items = ranked.data?.items ?? [];
    if (items.length === 0) {
      return (
        <EmptyState
          title="No items match"
          description="Try different words or filters."
          headingLevel={2}
        />
      );
    }
    return (
      <Grid columns={2} gap={4}>
        {items.map((item) => (
          <ClothingCard
            key={item.clothing.id}
            eventId={eventId}
            item={item.clothing}
            badge={badgeFor(item, ranked.data?.conditionCount ?? total)}
          />
        ))}
      </Grid>
    );
  }

  return (
    <VStack gap={4}>
      <HStack gap={2} align="end">
        <TextInput
          label="Search clothing"
          placeholder='Try "green jacket, chest around 21 inches"'
          value={text}
          onChange={setText}
          onEnter={handleSubmit}
        />
        <Button
          label="Search"
          variant="primary"
          size="lg"
          isLoading={interpret.isPending}
          isDisabled={!validateQuery(text) || interpret.isPending}
          onClick={handleSubmit}
        />
      </HStack>
      {interpretError !== null && (
        // Astryx layout components don't forward aria attributes, so a minimal element marks the live region.
        <section role="alert">
          <Text type="body">{interpretError}</Text>
        </section>
      )}
      {aiFallback && (
        // Astryx layout components don't forward aria attributes, so a minimal element marks the live region.
        <section role="alert">
          <VStack gap={2}>
            <Text type="body">{AI_UNAVAILABLE_MESSAGE}</Text>
            <Button label="Choose filters" size="lg" onClick={() => setFiltersOpen(true)} />
          </VStack>
        </section>
      )}
      {hasChips && (
        <HStack gap={2} wrap="wrap">
          {conditions.category !== null && (
            <Token
              label={categoryLabel(conditions.category)}
              onRemove={() => handleRemove({ kind: 'category' })}
            />
          )}
          {conditions.colors.map((color: ClothingColor) => (
            <Token
              key={color}
              label={colorLabel(color)}
              onRemove={() => handleRemove({ kind: 'color', color })}
            />
          ))}
          {measurementEntries.map(([name, range]) => {
            if (range === undefined) return null;
            const field = name as keyof SearchConditions['measurements'];
            return (
              <Token
                key={name}
                label={formatMeasurementLabel(field, range)}
                onRemove={() => handleRemove({ kind: 'measurement', name: field })}
              />
            );
          })}
        </HStack>
      )}
      {conditions.unrecognized.length > 0 && (
        <Text type="body" color="secondary">
          {`Not understood: ${conditions.unrecognized.join(', ')}`}
        </Text>
      )}
      <HStack gap={2} align="center" wrap="wrap">
        <Text type="body" color="secondary">
          {total > 0 || q !== '' ? 'Best matches first.' : 'Describe what you are looking for, or edit filters.'}
        </Text>
        <Button label="Edit filters" size="lg" onClick={() => setFiltersOpen(true)} />
      </HStack>
      {renderResults()}
      <SearchFiltersSheet
        isOpen={filtersOpen}
        onOpenChange={setFiltersOpen}
        conditions={conditions}
        onApply={handleApplyFilters}
      />
    </VStack>
  );
}
