import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventCreatedScreen } from '@/components/event/EventCreatedScreen';
import { saveEventSession } from '@/lib/session';

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

function seedSession() {
  saveEventSession('e1', { participantToken: 't1', participantId: 'p1', share });
}

describe('event created screen', () => {
  beforeEach(() => {
    localStorage.clear();
    setClipboard(undefined);
    qr.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('shows the saved event details, QR, notice, and links without exposing the token', async () => {
    seedSession();
    const { container } = render(<EventCreatedScreen eventId="e1" />);
    expect(await screen.findByRole('heading', { name: 'Event created' })).toBeVisible();
    expect(screen.getByText(share.name)).toBeVisible();
    expect(screen.getByText('Share the QR code or entry code with participants')).toBeVisible();
    expect(screen.getByText(share.entryCode, { exact: true })).toBeVisible();
    expect(screen.getByRole('img', { name: `QR code to join ${share.name}` })).toBeInTheDocument();
    expect(qr).toHaveBeenCalled();
    expect(qr.mock.calls.at(-1)?.[0].value).toBe(share.entryUrl);
    expect(
      screen.getByText(
        'Organizer access is stored on this device. Use the same device until the event ends.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Register my clothes' })).toHaveAttribute(
      'href',
      '/events/e1/my-items/new',
    );
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/events/e1');
    expect(container).not.toHaveTextContent('t1');
  });

  it('copies the entry URL and announces success', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    seedSession();
    render(<EventCreatedScreen eventId="e1" />);
    await user.click(await screen.findByRole('button', { name: 'Copy link' }));
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
      seedSession();
      render(<EventCreatedScreen eventId="e1" />);
      await user.click(await screen.findByRole('button', { name: 'Copy link' }));
      const input = await screen.findByRole('textbox');
      expect(input).toHaveValue(share.entryUrl);
      expect(input).toHaveAttribute('readonly');
      expect(screen.getByText('Copy this link manually.')).toBeVisible();
    },
  );

  it('guides to the start when no share details are saved', async () => {
    render(<EventCreatedScreen eventId="e1" />);
    expect(
      await screen.findByText("This event's share details aren't saved on this device."),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to start' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(qr).not.toHaveBeenCalled();
  });
});
