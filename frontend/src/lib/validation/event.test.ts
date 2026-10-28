import { describe, expect, it } from 'vitest';

import { toCreateEventRequest } from '@/lib/validation/event';

describe('toCreateEventRequest', () => {
  it('trims both fields without mutating the input', () => {
    const values = {
      name: '  Mangwon Flea Market Swap Corner  ',
      organizerDisplayName: '  Mina  ',
    };
    expect(toCreateEventRequest(values)).toEqual({
      name: 'Mangwon Flea Market Swap Corner',
      organizerDisplayName: 'Mina',
    });
    expect(values).toEqual({
      name: '  Mangwon Flea Market Swap Corner  ',
      organizerDisplayName: '  Mina  ',
    });
  });

  it('strips a trailing newline and a leading full-width space', () => {
    expect(toCreateEventRequest({ name: '\u3000Market', organizerDisplayName: 'Mina\n' })).toEqual({
      name: 'Market',
      organizerDisplayName: 'Mina',
    });
  });
});
