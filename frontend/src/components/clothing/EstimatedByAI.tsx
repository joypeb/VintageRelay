'use client';

import { Banner } from '@astryxdesign/core/Banner';
import { Heading } from '@astryxdesign/core/Heading';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';

import type { ClothingAnalysis } from '@/types/clothing';

export function EstimatedByAI({ analysis }: { analysis: ClothingAnalysis | null }) {
  if (analysis?.status === 'pending') {
    // Astryx layout components don't forward aria attributes, so a minimal element marks the live region.
    return (
      <div role="status">
        <Text type="body">AI analyzing…</Text>
        <Text type="body">Analysis runs in the background.</Text>
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
          <Stack direction="horizontal" gap={2} wrap="wrap">
            {features.colors.map((color, index) => (
              <Token key={`${index}-${color}`} label={color} />
            ))}
          </Stack>
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
          <Stack direction="horizontal" gap={2} wrap="wrap">
            {features.styleTags.map((tag, index) => (
              <Token key={`${index}-${tag}`} label={tag} />
            ))}
          </Stack>
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
          <ul className="m-0 list-disc pl-6">
            {analysis.uncertainties.map((uncertainty, index) => (
              // Messages are unique per aspect but index keys stay stable across refetches.
              <li key={`${index}-${uncertainty.message}`}>
                <Text type="body">{uncertainty.message}</Text>
              </li>
            ))}
          </ul>
        </Banner>
      ) : null}
    </VStack>
  );
}
