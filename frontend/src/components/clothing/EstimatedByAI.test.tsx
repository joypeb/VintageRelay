import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EstimatedByAI } from '@/components/clothing/EstimatedByAI';
import { renderWithClient } from '@/test/render';
import type { ClothingAnalysis } from '@/types/clothing';

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
} satisfies ClothingAnalysis;

const failedAnalysis = {
  contentVersion: 1,
  status: 'failed',
  features: null,
  uncertainties: [],
  modelInfo: null,
  updatedAt: '2026-11-04T00:01:00Z',
} satisfies ClothingAnalysis;

describe('EstimatedByAI', () => {
  it('renders colors, pattern, material, tags, details, and size when analysis is done', () => {
    renderWithClient(<EstimatedByAI analysis={doneAnalysis} />);

    expect(screen.getByText(/estimated by ai/i)).toBeVisible();
    expect(screen.getByText('green')).toBeVisible();
    expect(screen.getByText('navy')).toBeVisible();
    expect(screen.getByText('solid')).toBeVisible();
    expect(screen.getByText('denim')).toBeVisible();
    expect(screen.getByText('vintage')).toBeVisible();
    expect(screen.getByText('cropped')).toBeVisible();
    expect(screen.getByText('front zip')).toBeVisible();
    expect(screen.getByText('small chest logo')).toBeVisible();
    expect(screen.getByText('M', { exact: true })).toBeVisible();
  });

  it('renders uncertainties as check-in-person notes when analysis is done', () => {
    renderWithClient(<EstimatedByAI analysis={doneAnalysis} />);

    const notes = screen.getAllByText(/check in person/i);
    expect(notes.length).toBeGreaterThanOrEqual(2);
    for (const note of notes) {
      expect(note).toBeVisible();
    }
    expect(screen.getByText('Check in person for a back logo.')).toBeVisible();
  });

  it('renders nothing when analysis failed', () => {
    const { container } = renderWithClient(<EstimatedByAI analysis={failedAnalysis} />);

    expect(screen.queryByText(/estimated by ai/i)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when analysis is null', () => {
    const { container } = renderWithClient(<EstimatedByAI analysis={null} />);

    expect(screen.queryByText(/estimated by ai/i)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
