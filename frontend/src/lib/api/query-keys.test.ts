import { describe, expect, it } from 'vitest';

import { queryKeys } from '@/lib/api/query-keys';

describe('exchange query keys', () => {
  it('scopes intent and proposal lists and details by event', () => {
    expect(queryKeys.intents('e1', 'received')).not.toEqual(queryKeys.intents('e2', 'received'));
    expect(queryKeys.intents('e1', 'received')).not.toEqual(queryKeys.intents('e1', 'sent'));
    expect(queryKeys.proposals('e1')).not.toEqual(queryKeys.proposals('e2'));
    expect(queryKeys.proposal('e1', 'p1')).not.toEqual(queryKeys.proposal('e2', 'p1'));
    expect(queryKeys.proposal('e1', 'p1')).not.toEqual(queryKeys.proposal('e1', 'p2'));
  });
});
