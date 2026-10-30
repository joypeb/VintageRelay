import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { parsePhoto } from '@/lib/validation/photo-response';

const photo = {
  id: 'ph1',
  url: 'https://cdn.example/photos/ph1',
  contentType: 'image/jpeg',
  sizeBytes: 1834221,
  createdAt: '2026-10-27T05:42:10Z',
};

const { id: _id, ...withoutId } = photo;
void _id;

describe('parsePhoto', () => {
  it.each(['image/jpeg', 'image/webp'])('accepts a valid %s photo', (contentType) => {
    const response = { ...photo, contentType };
    expect(parsePhoto(response)).toEqual(response);
  });

  it.each([
    ['missing id', withoutId],
    ['empty id', { ...photo, id: '' }],
    ['invalid URL', { ...photo, url: 'not-a-url' }],
    ['unsupported content type', { ...photo, contentType: 'image/heic' }],
    ['zero size', { ...photo, sizeBytes: 0 }],
    ['size over 10 MiB', { ...photo, sizeBytes: 10485761 }],
    ['invalid creation date', { ...photo, createdAt: 'not-a-date' }],
    ['null', null],
  ])('rejects %s with an unexpected response error', (_description, data) => {
    try {
      parsePhoto(data);
      expect.fail('Expected an ApiError');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
    }
  });
});
