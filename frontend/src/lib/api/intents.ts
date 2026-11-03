import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { mutationKeys, queryKeys } from '@/lib/api/query-keys';
import type { Intent, IntentDirection, IntentList } from '@/types/intent';
import type { Proposal } from '@/types/proposal';

function intentPath(intentId: string, suffix: string = ''): string {
  return `/intents/${encodeURIComponent(intentId)}${suffix}`;
}

export async function registerIntent(
  eventId: string,
  body: { offeredClothingId: string; wantedClothingId: string },
): Promise<Intent> {
  return apiFetch<Intent>(eventId, `/events/${encodeURIComponent(eventId)}/intents`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type ListIntentsOptions = {
  direction?: IntentDirection;
  status?: string | string[];
  wantedClothingId?: string;
};

function toIntentsQuery(options: ListIntentsOptions): string {
  const params = new URLSearchParams();
  const direction = options.direction ?? 'sent';
  params.set('direction', direction);
  const status = options.status ?? 'active';
  for (const value of Array.isArray(status) ? status : [status]) {
    params.append('status', value);
  }
  if (options.wantedClothingId !== undefined) {
    params.set('wantedClothingId', options.wantedClothingId);
  }
  return params.toString();
}

export async function listIntents(
  eventId: string,
  options: ListIntentsOptions = {},
): Promise<IntentList> {
  const query = toIntentsQuery(options);
  return apiFetch<IntentList>(eventId, `/events/${encodeURIComponent(eventId)}/intents?${query}`);
}

export async function withdrawIntent(eventId: string, intentId: string): Promise<void> {
  await apiFetch<void>(eventId, intentPath(intentId), { method: 'DELETE' });
}

export async function acceptIntent(eventId: string, intentId: string): Promise<Proposal> {
  return apiFetch<Proposal>(eventId, intentPath(intentId, '/accept'), { method: 'POST' });
}

export async function declineIntent(eventId: string, intentId: string): Promise<Intent> {
  return apiFetch<Intent>(eventId, intentPath(intentId, '/decline'), { method: 'POST' });
}

function intentListParams(options: ListIntentsOptions): string {
  return toIntentsQuery(options);
}

export function useIntentsQuery(
  eventId: string,
  options: ListIntentsOptions & { enabled?: boolean; closed?: boolean } = {},
) {
  const { enabled = true, closed = false, ...filters } = options;
  const direction = filters.direction ?? 'sent';
  return useQuery({
    queryKey: queryKeys.intents(eventId, direction, intentListParams({ ...filters })),
    queryFn: () => listIntents(eventId, filters),
    enabled,
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: closed ? false : 15_000,
    refetchIntervalInBackground: false,
  });
}

function invalidateTradeKeys(eventId: string) {
  return { queryKey: ['events', eventId] as const };
}

export function useRegisterIntentMutation(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.registerIntent(eventId),
    mutationFn: (body: { offeredClothingId: string; wantedClothingId: string }) =>
      registerIntent(eventId, body),
    retry: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries(invalidateTradeKeys(eventId));
    },
  });
}

export function useWithdrawIntentMutation(eventId: string, intentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.withdrawIntent(eventId, intentId),
    mutationFn: () => withdrawIntent(eventId, intentId),
    retry: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries(invalidateTradeKeys(eventId));
    },
  });
}

export function useAcceptIntentMutation(eventId: string, intentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.acceptIntent(eventId, intentId),
    mutationFn: () => acceptIntent(eventId, intentId),
    retry: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries(invalidateTradeKeys(eventId));
    },
  });
}

export function useDeclineIntentMutation(eventId: string, intentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.declineIntent(eventId, intentId),
    mutationFn: () => declineIntent(eventId, intentId),
    retry: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries(invalidateTradeKeys(eventId));
    },
  });
}
