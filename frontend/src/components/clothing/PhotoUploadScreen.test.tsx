import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PhotoUploadScreen } from '@/components/clothing/PhotoUploadScreen';
import { ApiError } from '@/lib/api/api-error';
import { saveEventSession } from '@/lib/session';
import { renderWithClient } from '@/test/render';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));

const event = {
  id: 'e1',
  name: 'Neighborhood swap',
  status: 'active',
  entryCode: 'K7P3QX',
  entryUrl: 'http://localhost:3000/join?code=K7P3QX',
  organizerParticipantId: 'p-org',
  createdAt: '2026-10-28T00:00:00Z',
  closedAt: null,
  me: { participantId: 'p2', displayName: 'Joon', isOrganizer: false },
  stats: null,
};
const photo = {
  id: 'ph1',
  url: 'https://cdn.example/photos/ph1',
  contentType: 'image/jpeg',
  sizeBytes: 100,
  createdAt: '2026-10-27T05:42:10Z',
};

function uploadCalls() {
  return mocks.apiFetch.mock.calls.filter((call) => call[1] === '/events/e1/photos');
}

describe('US1 happy path', () => {
  beforeEach(() => {
    localStorage.clear();
    saveEventSession('e1', { participantToken: 't', participantId: 'p2' });
    mocks.apiFetch.mockReset();
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) => {
      if (path === '/events/e1') return Promise.resolve(event);
      if (path === '/events/e1/photos') return Promise.resolve(photo);
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:preview'),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  it('shows the empty photo step without uploading', async () => {
    renderWithClient(<PhotoUploadScreen eventId="e1" />);

    expect(await screen.findByLabelText('Clothing photo')).toHaveAttribute('type', 'file');
    expect(screen.getByText('Use a JPEG, PNG, or WebP photo of 10 MB or less.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose photo' })).toBeVisible();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);
  });

  it('previews, uploads, changes and removes a photo', async () => {
    const user = userEvent.setup();
    let resolveUpload!: (value: typeof photo) => void;
    const pending = new Promise<typeof photo>((resolve) => {
      resolveUpload = resolve;
    });
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) => {
      if (path === '/events/e1') return Promise.resolve(event);
      if (path === '/events/e1/photos')
        return uploadCalls().length === 1 ? pending : Promise.resolve(photo);
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    const { container } = renderWithClient(<PhotoUploadScreen eventId="e1" />);
    const file = new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' });
    const input = await screen.findByLabelText('Clothing photo');
    await user.upload(input, file);

    expect(await screen.findByRole('status')).toHaveTextContent('Uploading photo…');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:preview');
    expect(input).toBeDisabled();
    expect(uploadCalls()).toHaveLength(1);
    expect(uploadCalls()[0]?.[2].body).toBeInstanceOf(FormData);
    expect(uploadCalls()[0]?.[2].body.get('file')).toBe(file);

    await act(async () => resolveUpload(photo));
    expect(await screen.findByText('Photo ready')).toBeVisible();
    expect(screen.getByRole('img')).toHaveAttribute('src', photo.url);
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeVisible();
    expect(container).not.toHaveTextContent(/\bt\b/);

    const nextFile = new File(['new bytes'], 'coat.jpg', { type: 'image/jpeg' });
    await user.click(screen.getByRole('button', { name: 'Change photo' }));
    await user.upload(screen.getByLabelText('Clothing photo'), nextFile);
    await waitFor(() => expect(uploadCalls()).toHaveLength(2));
    expect(uploadCalls()[1]?.[2].body).toBeInstanceOf(FormData);
    expect(uploadCalls()[1]?.[2].body.get('file')).toBe(nextFile);
    expect(await screen.findByText('Photo ready')).toBeVisible();
    expect(screen.getByRole('img')).toHaveAttribute('src', photo.url);
    expect(
      mocks.apiFetch.mock.calls.every((call) =>
        ['/events/e1', '/events/e1/photos'].includes(call[1]),
      ),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('Photo ready')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose photo' })).toBeVisible();
    expect(uploadCalls()).toHaveLength(2);
  });

  it('keeps the empty step unchanged when the picker is cancelled', async () => {
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    const input = await screen.findByLabelText('Clothing photo');
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(screen.getByRole('button', { name: 'Choose photo' })).toBeVisible();
    expect(screen.getByText('Use a JPEG, PNG, or WebP photo of 10 MB or less.')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);
  });

  it('shows the existing access guidance for an unauthorized event query (regression guard)', async () => {
    mocks.apiFetch.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Unauthorized.'));
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    expect(await screen.findByText("You haven't joined this event on this device.")).toBeVisible();
    expect(screen.queryByLabelText('Clothing photo')).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);
  });

  it('shows the not-found guidance for a missing event', async () => {
    mocks.apiFetch.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Not here.'));
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    expect(await screen.findByText('This event could not be found.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to start' })).toBeVisible();
    expect(screen.queryByLabelText('Clothing photo')).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);
  });

  it('shows a retryable error when the event query fails', async () => {
    mocks.apiFetch.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'));
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'Server says no.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.queryByLabelText('Clothing photo')).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);
  });
});
