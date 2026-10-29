'use client';

import { useState } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { QRCodeSVG } from 'qrcode.react';

type CopyState = 'idle' | 'copied' | 'manual';

type EventShareCardProps = {
  name: string;
  entryCode: string;
  entryUrl: string;
};

export function EventShareCard({ name, entryCode, entryUrl }: EventShareCardProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');

  async function copyLink(url: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('manual');
    }
  }

  return (
    <VStack gap={6}>
      {/* Astryx layout components don't forward role/aria-label, so a minimal semantic element
          carries the accessible image. */}
      <VStack hAlign="center">
        <figure role="img" aria-label={`QR code to join ${name}`}>
          {/* Fixed black-on-white: scanner reliability needs maximum contrast regardless of
              theme (documented token-rule exception, research R10). */}
          <QRCodeSVG
            value={entryUrl}
            size={224}
            level="M"
            marginSize={4}
            fgColor="#000000"
            bgColor="#FFFFFF"
          />
        </figure>
      </VStack>
      <VStack gap={1} hAlign="center">
        <Text type="label">Entry code</Text>
        <Text type="code" size="4xl" weight="bold">
          {entryCode}
        </Text>
      </VStack>
      <VStack gap={3}>
        <Button label="Copy link" size="lg" width="100%" onClick={() => void copyLink(entryUrl)} />
        <Text type="body" as="p">
          {/* Always mounted so screen readers announce the text change; Text doesn't forward role. */}
          <span role="status" aria-live="polite">
            {copyState === 'copied' ? 'Link copied' : ''}
          </span>
        </Text>
        {copyState === 'manual' && (
          <VStack gap={1}>
            <TextInput label="Join link" value={entryUrl} isReadOnly size="lg" width="100%" />
            <Text type="body" color="secondary">
              Copy this link manually.
            </Text>
          </VStack>
        )}
      </VStack>
    </VStack>
  );
}
