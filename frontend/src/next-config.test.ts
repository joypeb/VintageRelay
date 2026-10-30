import { describe, expect, it } from 'vitest';

import nextConfig from '../next.config';

describe('photo rewrites', () => {
  it('routes photo URLs to the API', async () => {
    expect(await nextConfig.rewrites?.()).toContainEqual({
      source: '/api/v1/photos/:photoId',
      destination: 'http://api.test/api/v1/photos/:photoId',
    });
  });
});
