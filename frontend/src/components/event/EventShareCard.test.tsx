import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventShareCard } from '@/components/event/EventShareCard';

const qr = vi.hoisted(() => vi.fn<(props: { value: string }) => null>(() => null));
vi.mock('qrcode.react', () => ({ QRCodeSVG: qr }));

const share = {
  name: 'Mangwon Flea Market Swap Corner',
  entryCode: 'K7P3QX',
  entryUrl: 'http://localhost:3000/join?code=K7P3QX',
};
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setClipboard(value: { writeText: (text: string) => Promise<void> } | undefined) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

describe('event share card', () => {
  beforeEach(() => {
    setClipboard(undefined);
    qr.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('shows the QR and exact entry code', () => {
    render(<EventShareCard {...share} />);
    expect(screen.getByRole('img', { name: `QR code to join ${share.name}` })).toBeInTheDocument();
    expect(qr).toHaveBeenCalled();
    expect(qr.mock.calls.at(-1)?.[0].value).toBe(share.entryUrl);
    expect(screen.getByText(share.entryCode, { exact: true })).toBeVisible();
  });

  it('copies the entry URL and announces success', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<EventShareCard {...share} />);
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(share.entryUrl);
    const message = await screen.findByText('Link copied');
    expect(message.closest('[role="status"]')).not.toBeNull();
  });

  it.each(['rejected', 'unavailable'])(
    'offers manual copying when clipboard is %s',
    async (mode) => {
      const user = userEvent.setup();
      setClipboard(
        mode === 'rejected'
          ? { writeText: vi.fn().mockRejectedValue(new Error('Denied')) }
          : undefined,
      );
      render(<EventShareCard {...share} />);
      await user.click(screen.getByRole('button', { name: 'Copy link' }));
      const input = await screen.findByRole('textbox');
      expect(input).toHaveValue(share.entryUrl);
      expect(input).toHaveAttribute('readonly');
      expect(screen.getByText('Copy this link manually.')).toBeVisible();
    },
  );
});
