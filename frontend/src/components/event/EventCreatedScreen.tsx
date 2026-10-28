'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';

import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { QRCodeSVG } from 'qrcode.react';

import { routes } from '@/lib/routes';
import { getEventShare } from '@/lib/session';

const subscribe = () => () => {};

type CopyState = 'idle' | 'copied' | 'manual';

export function EventCreatedScreen({ eventId }: { eventId: string }) {
  // localStorage is unavailable during SSR, so render nothing until the client has mounted.
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const share = useMemo(() => (isMounted ? getEventShare(eventId) : null), [isMounted, eventId]);
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

  if (!isMounted) return null;

  if (!share) {
    return (
      <VStack gap={6} padding={6} minHeight="100dvh" vAlign="center">
        <Text type="body">This event&apos;s share details aren&apos;t saved on this device.</Text>
        <Button label="Go to start" size="lg" width="100%" href={routes.landing()} />
      </VStack>
    );
  }

  return (
    <VStack gap={6} padding={6}>
      <VStack gap={2}>
        <Heading level={1}>Event created</Heading>
        <Text type="large">{share.name}</Text>
        <Text type="body" color="secondary">
          Share the QR code or entry code with participants
        </Text>
      </VStack>
      {/* Astryx layout components don't forward role/aria-label, so a minimal semantic element
          carries the accessible image. */}
      <figure role="img" aria-label={`QR code to join ${share.name}`} className="mx-auto">
        {/* Fixed black-on-white: scanner reliability needs maximum contrast regardless of
            theme (documented token-rule exception, research R10). */}
        <QRCodeSVG
          value={share.entryUrl}
          size={224}
          level="M"
          marginSize={4}
          fgColor="#000000"
          bgColor="#FFFFFF"
        />
      </figure>
      <VStack gap={1} hAlign="center">
        <Text type="label">Entry code</Text>
        <Text type="code" size="4xl" weight="bold">
          {share.entryCode}
        </Text>
      </VStack>
      <VStack gap={3}>
        <Button
          label="Copy link"
          size="lg"
          width="100%"
          onClick={() => void copyLink(share.entryUrl)}
        />
        {copyState === 'copied' && (
          <Text type="body" as="p">
            <span role="status" aria-live="polite">
              Link copied
            </span>
          </Text>
        )}
        {copyState === 'manual' && (
          <VStack gap={1}>
            <TextInput label="Join link" value={share.entryUrl} isReadOnly size="lg" width="100%" />
            <Text type="body" color="secondary">
              Copy this link manually.
            </Text>
          </VStack>
        )}
      </VStack>
      <Text type="body" color="secondary">
        Organizer access is stored on this device. Use the same device until the event ends.
      </Text>
      <VStack gap={3}>
        <Button
          label="Register my clothes"
          variant="primary"
          size="lg"
          width="100%"
          href={routes.newItem(eventId)}
        />
        <Button label="Go home" size="lg" width="100%" href={routes.eventHome(eventId)} />
      </VStack>
    </VStack>
  );
}
