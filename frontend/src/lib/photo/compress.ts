import { MAX_PHOTO_BYTES } from '@/lib/validation/photo';

const QUALITIES = [0.9, 0.8, 0.7, 0.6] as const;
const SCALE_STEP = 0.8;
const MIN_LONGEST_SIDE = 1600;

export const TOO_LARGE_MESSAGE = 'This photo is too large. Choose a smaller photo.';

export type CompressEncode = (
  width: number,
  height: number,
  quality: number,
) => Promise<Blob>;

export type CompressDimensions = {
  maxBytes: number;
  width: number;
  height: number;
};

export type CompressToLimitResult =
  | { ok: true; blob: Blob }
  | { ok: false; message: string };

export async function compressToLimit(
  encode: CompressEncode,
  { maxBytes, width, height }: CompressDimensions,
): Promise<CompressToLimitResult> {
  let currentWidth = width;
  let currentHeight = height;
  for (;;) {
    for (const quality of QUALITIES) {
      let blob: Blob;
      try {
        blob = await encode(currentWidth, currentHeight, quality);
      } catch {
        break;
      }
      if (blob.size <= maxBytes) {
        return { ok: true, blob };
      }
    }
    const nextWidth = Math.round(currentWidth * SCALE_STEP);
    const nextHeight = Math.round(currentHeight * SCALE_STEP);
    if (Math.max(nextWidth, nextHeight) < MIN_LONGEST_SIDE) {
      return { ok: false, message: TOO_LARGE_MESSAGE };
    }
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }
}

export type CompressPhotoResult =
  | { ok: true; file: File }
  | { ok: false; message: string };

function encodeAt(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) {
    return Promise.reject(new Error('no 2d context'));
  }
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob === null) {
            reject(new Error('encode failed'));
          } else {
            resolve(blob);
          }
        },
        'image/jpeg',
        quality,
      );
    } catch (error) {
      reject(error);
    }
  });
}

export async function compressPhoto(file: File): Promise<CompressPhotoResult> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const result = await compressToLimit(
      (width, height, quality) => encodeAt(bitmap as ImageBitmap, width, height, quality),
      { maxBytes: MAX_PHOTO_BYTES, width: bitmap.width, height: bitmap.height },
    );
    if (!result.ok) {
      return result;
    }
    const dot = file.name.lastIndexOf('.');
    const base = dot > 0 ? file.name.slice(0, dot) : file.name || 'photo';
    return {
      ok: true,
      file: new File([result.blob], `${base}.jpg`, { type: 'image/jpeg' }),
    };
  } catch {
    return { ok: false, message: TOO_LARGE_MESSAGE };
  } finally {
    bitmap?.close();
  }
}
