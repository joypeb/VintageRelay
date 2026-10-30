import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { mutationKeys } from '@/lib/api/query-keys';
import { parsePhoto } from '@/lib/validation/photo-response';
import type { Photo } from '@/types/photo';

const UPLOAD_PHOTO_TIMEOUT_MS = 15000;

export async function uploadPhoto(eventId: string, file: File): Promise<Photo> {
  const body = new FormData();
  body.append('file', file);
  const data = await apiFetch<unknown>(
    eventId,
    `/events/${encodeURIComponent(eventId)}/photos`,
    { method: 'POST', body },
    { timeoutMs: UPLOAD_PHOTO_TIMEOUT_MS },
  );
  return parsePhoto(data);
}

export function useUploadPhotoMutation(eventId: string) {
  return useMutation({
    mutationKey: mutationKeys.uploadPhoto(eventId),
    mutationFn: (file: File) => uploadPhoto(eventId, file),
    retry: 0,
  });
}
