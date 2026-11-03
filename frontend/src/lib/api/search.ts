import { useMutation, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { shouldRetryClothingQuery } from '@/lib/api/clothing';
import { mutationKeys, queryKeys } from '@/lib/api/query-keys';
import { toSearchParams } from '@/lib/search/conditions';
import {
  parseSearchConditions,
  parseSearchResults,
} from '@/lib/validation/search-response';
import type { SearchConditions, SearchResults } from '@/types/search';

const SEARCH_READ_TIMEOUT_MS = 15_000;
// Backend interpretation budget is ~25s (2x10s attempts + waits), so wait 30s to receive its 503.
const INTERPRET_TIMEOUT_MS = 30_000;

function toRankedSearchParams(conditions: SearchConditions): URLSearchParams {
  const params = toSearchParams('', conditions);
  params.delete('q');
  params.delete('unrecognized');
  return params;
}

export async function interpretSearch(eventId: string, text: string): Promise<SearchConditions> {
  const data = await apiFetch<unknown>(
    eventId,
    `/events/${encodeURIComponent(eventId)}/search/interpretation`,
    { method: 'POST', body: JSON.stringify({ text }) },
    { timeoutMs: INTERPRET_TIMEOUT_MS },
  );
  return parseSearchConditions(data);
}

export async function searchClothing(
  eventId: string,
  conditions: SearchConditions,
): Promise<SearchResults> {
  const query = toRankedSearchParams(conditions).toString();
  const path =
    `/events/${encodeURIComponent(eventId)}/clothing/search` + (query === '' ? '' : `?${query}`);
  const data = await apiFetch<unknown>(
    eventId,
    path,
    {},
    { timeoutMs: SEARCH_READ_TIMEOUT_MS },
  );
  return parseSearchResults(data);
}

export function useInterpretSearch(eventId: string) {
  return useMutation({
    mutationKey: mutationKeys.interpretSearch(eventId),
    mutationFn: (text: string) => interpretSearch(eventId, text),
    retry: 0,
  });
}

export function useClothingSearch(
  eventId: string,
  conditions: SearchConditions,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const params = toRankedSearchParams(conditions).toString();
  return useQuery({
    queryKey: queryKeys.clothingSearch(eventId, params),
    queryFn: () => searchClothing(eventId, conditions),
    enabled,
    retry: shouldRetryClothingQuery,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
