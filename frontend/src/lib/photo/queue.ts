import type { Photo } from '@/types/photo';

export const MAX_QUEUE_PHOTOS = 10;

export type PhotoItemStatus = 'waiting' | 'preparing' | 'uploading' | 'ready' | 'failed';

export type PhotoItem = {
  key: string;
  file: File;
  previewUrl: string;
  status: PhotoItemStatus;
  photo?: Photo;
  error?: string;
  displayFailed?: boolean;
};

export type C2State = {
  step: 1 | 2;
  items: PhotoItem[];
  lastSkipped: number;
};

export const initialPhotoQueueState: C2State = { step: 1, items: [], lastSkipped: 0 };

export type PhotoQueueAddItem = {
  key: string;
  file: File;
  previewUrl: string;
};

export type PhotoQueueAction =
  | { type: 'add'; items: PhotoQueueAddItem[] }
  | { type: 'start'; key: string; status: 'preparing' | 'uploading' }
  | { type: 'prepared'; key: string; file: File }
  | { type: 'uploaded'; key: string; photo: Photo }
  | { type: 'failed'; key: string; message: string }
  | { type: 'remove'; key: string }
  | { type: 'retry'; key: string }
  | { type: 'displayFailed'; key: string }
  | { type: 'next' }
  | { type: 'back' };

export function nextToStart(state: C2State): PhotoItem | null {
  if (state.items.some((item) => item.status === 'preparing' || item.status === 'uploading')) {
    return null;
  }
  return state.items.find((item) => item.status === 'waiting') ?? null;
}

export function canProceed(state: C2State): boolean {
  return state.items.length >= 1 && state.items.every((item) => item.status === 'ready');
}

export function photoQueueReducer(state: C2State, action: PhotoQueueAction): C2State {
  switch (action.type) {
    case 'add': {
      const free = MAX_QUEUE_PHOTOS - state.items.length;
      const taken = action.items.slice(0, Math.max(0, free));
      return {
        ...state,
        items: [
          ...state.items,
          ...taken.map((item) => ({
            key: item.key,
            file: item.file,
            previewUrl: item.previewUrl,
            status: 'waiting' as const,
          })),
        ],
        lastSkipped: action.items.length - taken.length,
      };
    }
    case 'start': {
      return {
        ...state,
        items: state.items.map((item) =>
          item.key === action.key ? { ...item, status: action.status } : item,
        ),
      };
    }
    case 'prepared': {
      return {
        ...state,
        items: state.items.map((item) =>
          item.key === action.key
            ? { ...item, file: action.file, status: 'uploading' as const }
            : item,
        ),
      };
    }
    case 'uploaded': {
      return {
        ...state,
        items: state.items.map((item) =>
          item.key === action.key
            ? { ...item, status: 'ready' as const, photo: action.photo, error: undefined }
            : item,
        ),
      };
    }
    case 'failed': {
      return {
        ...state,
        items: state.items.map((item) =>
          item.key === action.key
            ? { ...item, status: 'failed' as const, error: action.message, photo: undefined }
            : item,
        ),
      };
    }
    case 'remove': {
      const target = state.items.find((item) => item.key === action.key);
      if (!target) return state;
      if (target.status === 'preparing' || target.status === 'uploading') return state;
      return { ...state, items: state.items.filter((item) => item.key !== action.key) };
    }
    case 'retry': {
      const target = state.items.find((item) => item.key === action.key);
      if (!target || target.status !== 'failed') return state;
      return {
        ...state,
        items: [
          ...state.items.filter((item) => item.key !== action.key),
          { ...target, status: 'waiting' as const, error: undefined, displayFailed: undefined },
        ],
      };
    }
    case 'displayFailed': {
      return {
        ...state,
        items: state.items.map((item) =>
          item.key === action.key ? { ...item, displayFailed: true } : item,
        ),
      };
    }
    case 'next': {
      if (!canProceed(state)) return state;
      return { ...state, step: 2 };
    }
    case 'back': {
      return { ...state, step: 1 };
    }
  }
}
