import { screen, within } from '@testing-library/react';
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

  it('renders each uncertainty as a list item in the check-in-person area', () => {
    renderWithClient(<EstimatedByAI analysis={doneAnalysis} />);
    const firstNote = screen.getByText('Check in person for a back logo.');
    const list = firstNote.closest<HTMLElement>('ul, ol');
    expect(list).not.toBeNull();
    if (!list) throw new Error('Expected a list of uncertainties');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Check in person for stains outside the frame.')).toBeVisible();
    const title = screen.getByText('Check in person', { exact: true });
    expect(title.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ['Colors', 'green', 'navy', 'Style'],
    ['Style', 'vintage', 'cropped', 'Colors'],
  ])('groups the individual %s values together', (label, first, second, otherLabel) => {
    renderWithClient(<EstimatedByAI analysis={doneAnalysis} />);
    const firstValue = screen.getByText(first, { exact: true });
    const secondValue = screen.getByText(second, { exact: true });
    expect(firstValue).not.toBe(secondValue);
    let group = firstValue.parentElement;
    while (group && !group.contains(secondValue)) group = group.parentElement;
    expect(group).not.toBeNull();
    if (!group) throw new Error(`Expected a group for ${label}`);
    expect(within(group).queryByText(otherLabel, { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText(label, { exact: true }).compareDocumentPosition(firstValue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('uses registration-neutral helper text while analysis is pending', () => {
    renderWithClient(<EstimatedByAI analysis={{ ...failedAnalysis, status: 'pending' }} />);

    expect(screen.getByText('Analysis runs in the background.', { exact: true })).toBeVisible();
    expect(screen.queryByText(/Registration is complete/i)).not.toBeInTheDocument();
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
