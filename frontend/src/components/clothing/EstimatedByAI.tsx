'use client';

import { Banner } from '@astryxdesign/core/Banner';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import type { ClothingAnalysis } from '@/types/clothing';

export function EstimatedByAI({ analysis }: { analysis: ClothingAnalysis | null }) {
  if (analysis?.status === 'pending') {
    // Astryx layout components don't forward aria attributes, so a minimal element marks the live region.
    return (
      <div role="status">
        <Text type="body">AI analyzing…</Text>
        <Text type="body">Registration is complete; analysis runs in the background.</Text>
      </div>
    );
  }
  if (analysis?.status !== 'done' || !analysis.features) return null;
  const features = analysis.features;
  return (
    <VStack gap={2}>
      <Heading level={2}>Estimated by AI</Heading>
      {features.colors.length > 0 ? (
        <>
          <Text type="label">Colors</Text>
          {features.colors.map((color, index) => (
            <Text key={`${index}-${color}`} type="body">
              {color}
            </Text>
          ))}
        </>
      ) : null}
      {features.pattern ? (
        <>
          <Text type="label">Pattern</Text>
          <Text type="body">{features.pattern}</Text>
        </>
      ) : null}
      {features.materialEstimate ? (
        <>
          <Text type="label">Material (estimate)</Text>
          <Text type="body">{features.materialEstimate}</Text>
        </>
      ) : null}
      {features.styleTags.length > 0 ? (
        <>
          <Text type="label">Style</Text>
          {features.styleTags.map((tag, index) => (
            <Text key={`${index}-${tag}`} type="body">
              {tag}
            </Text>
          ))}
        </>
      ) : null}
      {features.visibleDetails.length > 0 ? (
        <>
          <Text type="label">Details</Text>
          {features.visibleDetails.map((detail, index) => (
            <Text key={`${index}-${detail}`} type="body">
              {detail}
            </Text>
          ))}
        </>
      ) : null}
      {features.sizeLabel ? (
        <>
          <Text type="label">Size (from owner text or tag)</Text>
          <Text type="body">{features.sizeLabel}</Text>
        </>
      ) : null}
      {analysis.uncertainties.length > 0 ? (
        <Banner status="warning" title="Check in person" collapsible={false}>
          {analysis.uncertainties.map((uncertainty, index) => (
            // Messages are unique per aspect but index keys stay stable across refetches.
            <Text key={`${index}-${uncertainty.message}`} type="body">
              {uncertainty.message}
            </Text>
          ))}
        </Banner>
      ) : null}
    </VStack>
  );
}
