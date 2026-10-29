import { describe, expect, it } from 'vitest';

import { formatDateTime } from '@/lib/utils/date';

describe('formatDateTime', () => {
  it.each([
    ['UTC', 'Oct 27, 2026, 9:00 AM'],
    ['Asia/Seoul', 'Oct 27, 2026, 6:00 PM'],
  ])('formats the date and time in %s', (timeZone, expected) => {
    expect(formatDateTime('2026-10-27T09:00:00Z', 'en-US', timeZone).replace(/\s/g, ' ')).toBe(
      expected,
    );
  });
});
