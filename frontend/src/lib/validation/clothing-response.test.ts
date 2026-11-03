import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { parseClothing, parseClothingItem, parseClothingList } from '@/lib/validation/clothing-response';

const clothing = {
  id: 'c1',
  eventId: 'e1',
  owner: { participantId: 'p1', displayName: 'Alex', isOrganizer: true },
  isMine: false,
  photos: [
    { id: 'photo1', url: 'https://example.com/photo1.jpg' },
    { id: 'photo2', url: 'https://example.com/photo2.jpg' },
  ],
  category: 'outer',
  title: 'Green jacket',
  description: 'A warm jacket',
  measurements: {
    totalLength: 28,
    chest: 21.5,
    shoulder: 18,
    sleeve: 24,
    waist: 20,
    hem: 19,
    inseam: 30,
    thigh: 12,
  },
  status: 'available',
  contentVersion: 1,
  analysis: null,
  createdAt: '2026-11-02T05:30:00Z',
  updatedAt: '2026-11-02T06:00:00Z',
};

const nullMeasurements = {
  totalLength: null,
  chest: null,
  shoulder: null,
  sleeve: null,
  waist: null,
  hem: null,
  inseam: null,
  thigh: null,
};

describe('parseClothingItem', () => {
  it('preserves all fields and the order of photos and measurements', () => {
    expect(parseClothingItem(clothing)).toEqual(clothing);
  });

  it.each([nullMeasurements, null])('accepts empty measurements', (measurements) => {
    const item = { ...clothing, measurements };
    expect(parseClothingItem(item)).toEqual(item);
  });

  it('preserves withdrawn status', () => {
    const item = { ...clothing, status: 'withdrawn' };
    expect(parseClothingItem(item)).toEqual(item);
  });

  const { id: _id, ...withoutId } = clothing;
  void _id;
  it.each([
    ['missing ID', withoutId],
    ['invalid category', { ...clothing, category: 'shoes' }],
    ['empty photos', { ...clothing, photos: [] }],
  ])('rejects %s with an unexpected response error', (_description, item) => {
    try {
      parseClothingItem(item);
      expect.fail('Expected an ApiError');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
    }
  });
});

describe('parseClothingList', () => {
  it('preserves two items and the null cursor', () => {
    const list = { items: [clothing, { ...clothing, id: 'c2' }], nextCursor: null };
    expect(parseClothingList(list)).toEqual(list);
  });
});

describe('parseClothing', () => {
  it('continues to parse an ID-only registration response', () => {
    expect(parseClothing({ id: 'c1' })).toEqual({ id: 'c1' });
  });
});

const pendingAnalysis = {
  contentVersion: 1,
  status: 'pending',
  features: null,
  uncertainties: [],
  modelInfo: null,
  updatedAt: '2026-11-04T00:00:00Z',
};

const doneAnalysis = {
  contentVersion: 1,
  status: 'done',
  features: {
    colors: ['green', 'navy'],
    pattern: 'solid',
    materialEstimate: 'denim',
    styleTags: ['vintage', 'cropped'],
    visibleDetails: ['front zip', 'small chest logo'],
    sizeLabel: 'M',
  },
  uncertainties: [
    { aspect: 'logo', message: 'Check in person for a back logo.' },
    { aspect: 'condition', message: 'Check in person for stains outside the frame.' },
  ],
  modelInfo: { modelId: 'muse-spark-1.3' },
  updatedAt: '2026-11-04T00:01:00Z',
};

const failedAnalysis = {
  contentVersion: 1,
  status: 'failed',
  features: null,
  uncertainties: [],
  modelInfo: null,
  updatedAt: '2026-11-04T00:01:00Z',
};

const staleAnalysis = {
  contentVersion: 1,
  status: 'stale',
  features: null,
  uncertainties: [],
  modelInfo: null,
  updatedAt: '2026-11-04T00:01:00Z',
};

function expectUnknownError(item: unknown) {
  try {
    parseClothingItem(item);
    expect.fail('Expected an ApiError');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
  }
}

describe('parseClothingItem analysis', () => {
  it('parses pending analysis without features', () => {
    expect(parseClothingItem({ ...clothing, analysis: pendingAnalysis })).toEqual({
      ...clothing,
      analysis: pendingAnalysis,
    });
  });

  it('parses done analysis with full features and uncertainties', () => {
    expect(parseClothingItem({ ...clothing, analysis: doneAnalysis })).toEqual({
      ...clothing,
      analysis: doneAnalysis,
    });
  });

  it('parses failed analysis without features', () => {
    expect(parseClothingItem({ ...clothing, analysis: failedAnalysis })).toEqual({
      ...clothing,
      analysis: failedAnalysis,
    });
  });

  it('parses stale analysis for forward compatibility', () => {
    expect(parseClothingItem({ ...clothing, analysis: staleAnalysis })).toEqual({
      ...clothing,
      analysis: staleAnalysis,
    });
  });

  it('parses done analysis with null token counts as the backend sends them', () => {
    const backendDone = {
      ...doneAnalysis,
      modelInfo: { modelId: 'muse-spark-1.3', latencyMs: 17453, promptTokens: null, completionTokens: null },
    };
    expect(parseClothingItem({ ...clothing, analysis: backendDone })).toEqual({
      ...clothing,
      analysis: backendDone,
    });
  });

  it('parses done analysis with null model metrics', () => {
    const analysis = {
      ...doneAnalysis,
      modelInfo: { modelId: 'muse-spark-1.3', latencyMs: null, promptTokens: null, completionTokens: null },
    };
    expect(parseClothingItem({ ...clothing, analysis })).toEqual({ ...clothing, analysis });
  });

  it('parses done analysis with empty colors and null estimates', () => {
    const emptyEstimates = {
      ...doneAnalysis,
      features: {
        colors: [],
        pattern: null,
        materialEstimate: null,
        styleTags: [],
        visibleDetails: [],
        sizeLabel: null,
      },
      uncertainties: [{ aspect: 'color', message: 'Check in person for the exact shade.' }],
    };
    expect(parseClothingItem({ ...clothing, analysis: emptyEstimates })).toEqual({
      ...clothing,
      analysis: emptyEstimates,
    });
  });

  it.each([
    ['unknown color', { ...doneAnalysis, features: { ...doneAnalysis.features, colors: ['chartreuse'] } }],
    ['invalid pattern', { ...doneAnalysis, features: { ...doneAnalysis.features, pattern: 'polka' } }],
    ['too many colors', {
      ...doneAnalysis,
      features: { ...doneAnalysis.features, colors: ['green', 'navy', 'blue', 'red'] },
    }],
    ['too many style tags', {
      ...doneAnalysis,
      features: { ...doneAnalysis.features, styleTags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] },
    }],
    ['too many visible details', {
      ...doneAnalysis,
      features: { ...doneAnalysis.features, visibleDetails: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] },
    }],
  ])('rejects done analysis with %s', (_label, analysis) => {
    expectUnknownError({ ...clothing, analysis });
  });

  it.each([
    ['unknown aspect', [{ aspect: 'price', message: 'Check in person.' }]],
    ['overlong message', [{ aspect: 'logo', message: 'x'.repeat(201) }]],
  ])('rejects done analysis with uncertainties %s', (_label, uncertainties) => {
    expectUnknownError({ ...clothing, analysis: { ...doneAnalysis, uncertainties } });
  });

  it.each([
    ['missing status', { ...pendingAnalysis, status: undefined }],
    ['unknown status', { ...pendingAnalysis, status: 'analyzing' }],
    ['wrong features type', { ...pendingAnalysis, features: 'pending' }],
    ['missing uncertainties', { ...pendingAnalysis, uncertainties: undefined }],
    ['invalid updatedAt', { ...pendingAnalysis, updatedAt: 'not-a-date' }],
    ['string shape', 'pending'],
  ])('rejects malformed analysis %s with an unexpected response error', (_label, analysis) => {
    expectUnknownError({ ...clothing, analysis });
  });
});
