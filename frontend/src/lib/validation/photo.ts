export const MAX_PHOTO_BYTES = 10485760;

export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export type PhotoValidation = { ok: true; file: File } | { ok: false; message: string };

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index).toLowerCase();
}

export function validatePhotoFile(file: File | null | undefined): PhotoValidation {
  if (file === null || file === undefined) {
    return { ok: false, message: 'Choose a photo to upload.' };
  }
  if (file.size === 0) {
    return { ok: false, message: 'The chosen file is empty. Choose another photo.' };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, message: 'Choose a photo of 10 MB or less.' };
  }
  if ((ALLOWED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return { ok: true, file };
  }
  if (file.type === '' || file.type === 'application/octet-stream') {
    return ALLOWED_EXTENSIONS.has(extensionOf(file.name))
      ? { ok: true, file }
      : { ok: false, message: 'Use a JPEG, PNG, or WebP photo.' };
  }
  return { ok: false, message: 'Use a JPEG, PNG, or WebP photo.' };
}
