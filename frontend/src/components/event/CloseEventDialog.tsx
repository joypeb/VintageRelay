'use client';

import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

type CloseEventDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
  errorMessage?: string;
};

export function CloseEventDialog({
  isOpen,
  onOpenChange,
  onConfirm,
  isPending,
  errorMessage,
}: CloseEventDialogProps) {
  // Dismissal is blocked while the close request is in flight.
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isPending) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={handleOpenChange} purpose="info">
      <DialogHeader title="Close this event?" />
      <VStack gap={4} padding={6}>
        <Text type="body">
          Closing ends the exchange corner for everyone. Participants can no longer register clothes
          or make exchanges. This can&apos;t be undone.
        </Text>
        {errorMessage && (
          // Banner doesn't create a live region, so a wrapper announces the error.
          <div role="alert">
            <Banner status="error" title={errorMessage} />
          </div>
        )}
        <Button
          label="Close event"
          variant="destructive"
          size="lg"
          width="100%"
          isLoading={isPending}
          onClick={onConfirm}
        />
        <Button
          label="Cancel"
          variant="ghost"
          size="lg"
          width="100%"
          isDisabled={isPending}
          onClick={() => handleOpenChange(false)}
        />
      </VStack>
    </Dialog>
  );
}
