import { describe, expect, it } from 'vitest';

import { validatePhotoFile } from '@/lib/validation/photo';

describe('validatePhotoFile', () => {
  it.each([null, undefined])('rejects a missing file %s', (file) => {
    expect(validatePhotoFile(file)).toEqual({ ok: false, message: 'Choose a photo to upload.' });
  });

  it('rejects an empty file', () => {
    const file = { size: 0, type: 'image/jpeg', name: 'a.jpg' } as File;
    expect(validatePhotoFile(file)).toEqual({
      ok: false,
      message: 'The chosen file is empty. Choose another photo.',
    });
  });

  it('rejects a file larger than 10 MiB', () => {
    const file = { size: 10485761, type: 'image/jpeg', name: 'a.jpg' } as File;
    expect(validatePhotoFile(file)).toEqual({ ok: false, message: 'Choose a photo of 10 MB or less.' });
  });

  it('accepts the same file at exactly 10 MiB', () => {
    const file = { size: 10485760, type: 'image/jpeg', name: 'a.jpg' } as File;
    const result = validatePhotoFile(file);
    expect(result).toEqual({ ok: true, file });
    if (result.ok) expect(result.file).toBe(file);
  });

  it('rejects HEIC files', () => {
    const file = { size: 100, type: 'image/heic', name: 'a.heic' } as File;
    expect(validatePhotoFile(file)).toEqual({ ok: false, message: 'Use a JPG/JPEG, PNG, or WebP photo.' });
  });

  it.each([
    ['image/jpeg', 'a.jpg'],
    ['image/png', 'a.png'],
    ['image/webp', 'a.webp'],
  ])('accepts %s photos', (type, name) => {
    const file = { size: 100, type, name } as File;
    expect(validatePhotoFile(file)).toEqual({ ok: true, file });
  });

  it('accepts the image/jpg type', () => {
    const file = { size: 100, type: 'image/jpg', name: 'a.jpg' } as File;
    expect(validatePhotoFile(file)).toEqual({ ok: true, file });
  });

  it('accepts an uppercase JPG extension when the type is hidden', () => {
    const file = { size: 100, type: '', name: 'B.JPG' } as File;
    expect(validatePhotoFile(file)).toEqual({ ok: true, file });
  });

  it('accepts a JPEG extension when the type is hidden', () => {
    const file = { size: 100, type: '', name: 'a.jpg' } as File;
    expect(validatePhotoFile(file)).toEqual({ ok: true, file });
  });

  it('rejects an unsupported extension when the type is hidden', () => {
    const file = { size: 100, type: '', name: 'a.txt' } as File;
    expect(validatePhotoFile(file)).toEqual({ ok: false, message: 'Use a JPG/JPEG, PNG, or WebP photo.' });
  });

  it('accepts a PNG extension for a generic type', () => {
    const file = { size: 100, type: 'application/octet-stream', name: 'a.png' } as File;
    expect(validatePhotoFile(file)).toEqual({ ok: true, file });
  });
});
