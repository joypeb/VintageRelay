import { describe, expect, it, vi } from 'vitest';

import { compressToLimit } from '@/lib/photo/compress';

describe('compressToLimit', () => {
  it('scales down after an encoder rejects an oversized canvas', async () => {
    const blob = new Blob(['small']);
    const encode = vi.fn(async (width: number, height: number, _quality: number) => {
      if (width * height > 16_777_216) throw new Error('Canvas too large');
      return blob;
    });
    await expect(compressToLimit(encode, { maxBytes: 10, width: 8000, height: 6000 })).resolves.toEqual({
      ok: true,
      blob,
    });
    expect(encode.mock.calls).toEqual([
      [8000, 6000, 0.9],
      [6400, 4800, 0.9],
      [5120, 3840, 0.9],
      [4096, 3072, 0.9],
    ]);
  });

  it('returns a failure when the encoder rejects through the size floor', async () => {
    const encode = vi.fn(async (_width: number, _height: number, _quality: number): Promise<Blob> => {
      throw new Error('Cannot encode');
    });
    await expect(compressToLimit(encode, { maxBytes: 10, width: 4000, height: 3000 })).resolves.toEqual({
      ok: false,
      message: 'This photo is too large. Choose a smaller photo.',
    });
    expect(encode.mock.calls).toEqual([
      [4000, 3000, 0.9],
      [3200, 2400, 0.9],
      [2560, 1920, 0.9],
      [2048, 1536, 0.9],
      [1638, 1229, 0.9],
    ]);
  });

  it('tries qualities at full size and returns the first blob that fits', async () => {
    const blobs = [11, 12, 9, 8].map((size) => new Blob([new Uint8Array(size)]));
    const encode = vi.fn(async () => {
      const blob = blobs[encode.mock.calls.length - 1];
      if (!blob) throw new Error('Unexpected encode call');
      return blob;
    });
    expect(await compressToLimit(encode, { maxBytes: 10, width: 4000, height: 3000 })).toEqual({
      ok: true,
      blob: blobs[2],
    });
    expect(encode.mock.calls).toEqual([
      [4000, 3000, 0.9],
      [4000, 3000, 0.8],
      [4000, 3000, 0.7],
    ]);
  });

  it('retries every quality at each scaled size until the floor', async () => {
    const encode = vi.fn(
      async (_width: number, _height: number, _quality: number) => new Blob([new Uint8Array(11)]),
    );
    expect(await compressToLimit(encode, { maxBytes: 10, width: 4000, height: 3000 })).toEqual({
      ok: false,
      message: 'This photo is too large. Choose a smaller photo.',
    });
    expect(encode.mock.calls).toEqual(
      [
        [4000, 3000],
        [3200, 2400],
        [2560, 1920],
        [2048, 1536],
        [1638, 1229],
      ].flatMap(([width, height]) =>
        [0.9, 0.8, 0.7, 0.6].map((quality) => [width, height, quality]),
      ),
    );
  });

  it('does not scale an image already below the floor', async () => {
    const encode = vi.fn(
      async (_width: number, _height: number, _quality: number) => new Blob([new Uint8Array(11)]),
    );
    expect(await compressToLimit(encode, { maxBytes: 10, width: 1000, height: 1500 })).toEqual({
      ok: false,
      message: 'This photo is too large. Choose a smaller photo.',
    });
    expect(encode.mock.calls).toEqual([0.9, 0.8, 0.7, 0.6].map((quality) => [1000, 1500, quality]));
  });

  it('accepts a blob exactly at the size limit', async () => {
    const blob = new Blob([new Uint8Array(10)]);
    const encode = vi.fn(async () => blob);
    expect(await compressToLimit(encode, { maxBytes: 10, width: 1000, height: 1500 })).toEqual({
      ok: true,
      blob,
    });
    expect(encode).toHaveBeenCalledTimes(1);
  });
});
