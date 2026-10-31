export const SLIDE_DURATION_MS = 300;

export function indexFromScroll(scrollLeft: number, slideWidth: number, count: number): number {
  if (count <= 0 || slideWidth <= 0) return 0;
  const index = Math.round(scrollLeft / slideWidth);
  return Math.min(Math.max(index, 0), count - 1);
}

export function linearScrollAt(
  from: number,
  to: number,
  elapsedMs: number,
  durationMs: number,
): number {
  if (durationMs <= 0) return to;
  if (elapsedMs <= 0) return from;
  if (elapsedMs >= durationMs) return to;
  return from + (to - from) * (elapsedMs / durationMs);
}

export function nextTarget(
  index: number,
  targetIndex: number | null,
  dir: -1 | 1,
  count: number,
): number {
  if (count <= 0) return 0;
  const base = targetIndex ?? index;
  return Math.min(Math.max(base + dir, 0), count - 1);
}
