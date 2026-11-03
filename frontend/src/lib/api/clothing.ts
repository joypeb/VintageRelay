import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

export type ClothingOwnership = 'mine' | 'others';

export async function listClothing(
  eventId: string,
  ownership: ClothingOwnership = 'others',
): Promise<ClothingList> {
  const query =
    ownership === 'mine' ? '?ownership=mine' : '?ownership=others&status=available';
  const data = await apiFetch<unknown>(
    eventId,
    `/events/${encodeURIComponent(eventId)}/clothing${query}`,
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

export async function updateClothing(
  eventId: string,
  clothingId: string,
  body: RegisterClothingBody,
): Promise<Clothing> {
  const data = await apiFetch<unknown>(
    eventId,
    `/clothing/${encodeURIComponent(clothingId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    { timeoutMs: CLOTHING_READ_TIMEOUT_MS },
  );
  return parseClothingItem(data);
}

export async function deleteClothing(eventId: string, clothingId: string): Promise<void> {
  await apiFetch<void>(
    eventId,
    `/clothing/${encodeURIComponent(clothingId)}`,
    { method: 'DELETE' },
    { timeoutMs: CLOTHING_READ_TIMEOUT_MS },
  );
}

export function shouldRetryClothingQuery(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') return failureCount < MAX_CLOTHING_QUERY_RETRIES;
    if (error.status >= 500 && error.status <= 599) return failureCount < MAX_CLOTHING_QUERY_RETRIES;
    return false;
  }
  return failureCount < MAX_CLOTHING_QUERY_RETRIES;
}

export function useClothingListQuery(eventId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.clothingList(eventId, 'others'),
    queryFn: () => listClothing(eventId, 'others'),
    enabled,
    retry: shouldRetryClothingQuery,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useMyItemsQuery(eventId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.clothingList(eventId, 'mine'),
    queryFn: () => listClothing(eventId, 'mine'),
    enabled,
    retry: shouldRetryClothingQuery,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.analysis?.status === 'pending') ? 5000 : false,
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
    refetchInterval: (query) =>
      query.state.data?.analysis?.status === 'pending' ? 5000 : false,
  });
}

export function useUpdateClothingMutation(eventId: string, clothingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.updateClothing(eventId, clothingId),
    mutationFn: (body: RegisterClothingBody) => updateClothing(eventId, clothingId, body),
    retry: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.clothingList(eventId, 'mine'),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.clothing(eventId, clothingId),
      });
    },
  });
}

export function useDeleteClothingMutation(eventId: string, clothingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.deleteClothing(eventId, clothingId),
    mutationFn: () => deleteClothing(eventId, clothingId),
    retry: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.clothingList(eventId, 'mine'),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.clothing(eventId, clothingId),
      });
    },
  });
}
