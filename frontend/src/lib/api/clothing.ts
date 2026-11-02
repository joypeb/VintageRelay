import { useMutation, useQuery } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';
import { apiFetch } from '@/lib/api/client';
import { mutationKeys, queryKeys } from '@/lib/api/query-keys';
import type { RegisterClothingBody } from '@/lib/validation/clothing-form';
import { parseClothing, parseClothingItem, parseClothingList } from '@/lib/validation/clothing-response';
import type { RegisteredClothing } from '@/lib/validation/clothing-response';
import type { Clothing, ClothingList } from '@/types/clothing';

export const REGISTER_CLOTHING_TIMEOUT_MS = 15_000;
const CLOTHING_READ_TIMEOUT_MS = 15_000;
const MAX_CLOTHING_QUERY_RETRIES = 1;

export async function registerClothing(
  eventId: string,
  body: RegisterClothingBody,
): Promise<RegisteredClothing> {
  const data = await apiFetch<unknown>(
    eventId,
    `/events/${encodeURIComponent(eventId)}/clothing`,
    { method: 'POST', body: JSON.stringify(body) },
    { timeoutMs: REGISTER_CLOTHING_TIMEOUT_MS },
  );
  return parseClothing(data);
}

export function useRegisterClothingMutation(eventId: string) {
  return useMutation({
    mutationKey: mutationKeys.registerClothing(eventId),
    mutationFn: (body: RegisterClothingBody) => registerClothing(eventId, body),
    retry: 0,
  });
}

export async function listClothing(eventId: string): Promise<ClothingList> {
  const data = await apiFetch<unknown>(
    eventId,
    `/events/${encodeURIComponent(eventId)}/clothing?ownership=others&status=available`,
    {},
    { timeoutMs: CLOTHING_READ_TIMEOUT_MS },
  );
  return parseClothingList(data);
}

export async function getClothing(eventId: string, clothingId: string): Promise<Clothing> {
  const data = await apiFetch<unknown>(
    eventId,
    `/clothing/${encodeURIComponent(clothingId)}`,
    {},
    { timeoutMs: CLOTHING_READ_TIMEOUT_MS },
  );
  return parseClothingItem(data);
}

export function shouldRetryClothingQuery(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError) {
    if (error.code === 'UNAUTHENTICATED' || error.code === 'NOT_FOUND') return false;
  }
  return failureCount < MAX_CLOTHING_QUERY_RETRIES;
}

export function useClothingListQuery(eventId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.clothingList(eventId),
    queryFn: () => listClothing(eventId),
    enabled,
    retry: shouldRetryClothingQuery,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useClothingQuery(
  eventId: string,
  clothingId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.clothing(eventId, clothingId),
    queryFn: () => getClothing(eventId, clothingId),
    enabled,
    retry: shouldRetryClothingQuery,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
