'use client';

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
      </div>
    );
  }
  if (analysis?.status !== 'done' || !analysis.features) return null;
  const features = analysis.features;
  return (
    <VStack gap={2}>
      <Heading level={2}>Estimated by AI</Heading>
      {features.colors.map((color, index) => (
        <Text key={`${index}-${color}`} type="body">
          {color}
        </Text>
      ))}
      {features.pattern ? <Text type="body">{features.pattern}</Text> : null}
      {features.materialEstimate ? <Text type="body">{features.materialEstimate}</Text> : null}
      {features.styleTags.map((tag, index) => (
        <Text key={`${index}-${tag}`} type="body">
          {tag}
        </Text>
      ))}
      {features.visibleDetails.map((detail, index) => (
        <Text key={`${index}-${detail}`} type="body">
          {detail}
        </Text>
      ))}
      {features.sizeLabel ? <Text type="body">{features.sizeLabel}</Text> : null}
      {analysis.uncertainties.map((uncertainty, index) => (
        // Messages are unique per aspect but index keys stay stable across refetches.
        <Text key={`${index}-${uncertainty.message}`} type="body">
          {uncertainty.message}
        </Text>
      ))}
    </VStack>
  );
}
