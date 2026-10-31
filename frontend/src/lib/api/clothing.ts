import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { mutationKeys } from '@/lib/api/query-keys';
import type { RegisterClothingBody } from '@/lib/validation/clothing-form';
import { parseClothing } from '@/lib/validation/clothing-response';
import type { RegisteredClothing } from '@/lib/validation/clothing-response';

export const REGISTER_CLOTHING_TIMEOUT_MS = 15_000;

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
