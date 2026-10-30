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

describe('US2 failures', () => {
  beforeEach(() => {
    localStorage.clear();
    saveEventSession('e1', { participantToken: 'SECRET-TOKEN', participantId: 'p2' });
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

  async function chooseFile(user: ReturnType<typeof userEvent.setup>, file: File) {
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await user.upload(await screen.findByLabelText('Clothing photo'), file);
  }

  function rejectUpload(error: unknown) {
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) => {
      if (path === '/events/e1') return Promise.resolve(event);
      if (path === '/events/e1/photos') return Promise.reject(error);
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
  }

  it.each([
    [
      'oversized',
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }),
      'Choose a photo of 10 MB or less.',
    ],
    [
      'HEIC',
      new File(['bytes'], 'photo.heic', { type: 'image/heic' }),
      'Use a JPEG, PNG, or WebP photo.',
    ],
  ])('rejects an %s file locally without uploading', async (_name, file, message) => {
    await chooseFile(userEvent.setup({ applyAccept: false }), file);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(uploadCalls()).toHaveLength(0);
  });

  it.each([
    [413, 'FILE_TOO_LARGE', 'Photo exceeds the 10 MB limit.'],
    [415, 'UNSUPPORTED_MEDIA_TYPE', 'Use a JPEG, PNG, or WebP photo.'],
  ])('shows a retryable photo error for %s', async (status, code, message) => {
    const user = userEvent.setup();
    const file = new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' });
    rejectUpload(new ApiError(status, code, message));
    await chooseFile(user, file);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('img', { name: /preview/i })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose another photo' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(uploadCalls()).toHaveLength(2));
    expect(uploadCalls()[1]?.[2].body.get('file')).toBe(file);
  });

  it('shows device access guidance when an upload is unauthorized', async () => {
    rejectUpload(new ApiError(401, 'UNAUTHENTICATED', 'Unauthorized.'));
    await chooseFile(userEvent.setup(), new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText("You haven't joined this event on this device.")).toBeVisible();
    expect(screen.getByRole('link', { name: 'Join with entry code' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to start' })).toBeVisible();
    expect(screen.queryByLabelText('Clothing photo')).not.toBeInTheDocument();
  });

  it('shows the not-found view when an upload cannot find the event', async () => {
    rejectUpload(new ApiError(404, 'NOT_FOUND', 'Not here.'));
    await chooseFile(userEvent.setup(), new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('This event could not be found.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to start' })).toBeVisible();
    expect(screen.queryByLabelText('Clothing photo')).not.toBeInTheDocument();
  });

  it('disables the photo step when an upload finds the event closed', async () => {
    rejectUpload(new ApiError(409, 'EVENT_CLOSED', 'Event closed.'));
    await chooseFile(userEvent.setup(), new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('This event has ended.')).toBeVisible();
    expect(screen.getByLabelText('Clothing photo')).toBeDisabled();
  });

  it.each([
    ['network failure', new ApiError(0, 'NETWORK_ERROR', 'Network unavailable.')],
    ['server failure', new ApiError(500, 'INTERNAL_ERROR', 'Server says no.')],
  ])('focuses the retryable error after a %s', async (_name, error) => {
    const user = userEvent.setup();
    const file = new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' });
    const location = window.location.href;
    rejectUpload(error);
    await chooseFile(user, file);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(error.message);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole('img', { name: /preview/i })).toBeVisible();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(window.location.href).toBe(location);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(uploadCalls()).toHaveLength(2));
    expect(uploadCalls()[1]?.[2].body.get('file')).toBe(file);
    expect(window.location.href).toBe(location);
  });

  it.each(['invalid body', 'unreadable 201 body'])(
    'offers a focused retry for an %s',
    async (scenario) => {
      if (scenario === 'invalid body') {
        mocks.apiFetch.mockImplementation((_eventId: string, path: string) =>
          path === '/events/e1' ? Promise.resolve(event) : Promise.resolve({ invalid: true }),
        );
      } else {
        rejectUpload(new ApiError(201, 'UNKNOWN_ERROR', 'Please try again shortly.'));
      }
      await chooseFile(
        userEvent.setup(),
        new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' }),
      );
      const alert = await screen.findByRole('alert');
      expect(alert).toBeVisible();
      await waitFor(() => expect(alert).toHaveFocus());
      expect(screen.queryByText('Photo ready')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    },
  );

  it('keeps credentials, file names, headers and photo URLs out of logs', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const file = new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' });
      const user = userEvent.setup();
      const first = renderWithClient(<PhotoUploadScreen eventId="e1" />);
      await user.upload(await screen.findByLabelText('Clothing photo'), file);
      expect(await screen.findByText('Photo ready')).toBeVisible();
      first.unmount();

      rejectUpload(new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'));
      const second = renderWithClient(<PhotoUploadScreen eventId="e1" />);
      await user.upload(await screen.findByLabelText('Clothing photo'), file);
      await waitFor(() => expect(screen.getByLabelText('Clothing photo')).toBeEnabled());
      expect(uploadCalls()).toHaveLength(2);
      second.unmount();

      rejectUpload(new Error('boom'));
      const third = renderWithClient(<PhotoUploadScreen eventId="e1" />);
      await user.upload(await screen.findByLabelText('Clothing photo'), file);
      await waitFor(() => expect(screen.getByLabelText('Clothing photo')).toBeEnabled());
      expect(uploadCalls()).toHaveLength(3);
      third.unmount();

      const logged = [...errorSpy.mock.calls, ...warnSpy.mock.calls]
        .flat()
        .map((argument) => String(JSON.stringify(argument)))
        .join(' ');
      for (const secret of ['SECRET-TOKEN', 'jacket.jpg', 'Authorization', 'Bearer', '/photos/']) {
        expect(logged).not.toContain(secret);
      }
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

describe('US3 stability', () => {
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

  it('keeps the ready photo on rerender without uploading again', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await user.upload(
      await screen.findByLabelText('Clothing photo'),
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
    );
    expect(await screen.findByText('Photo ready')).toBeVisible();
    rerender(<PhotoUploadScreen eventId="e1" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', photo.url);
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeVisible();
    expect(uploadCalls()).toHaveLength(1);
  });

  it('sends only one retry on a double click while the upload is pending', async () => {
    const user = userEvent.setup();
    const pending = new Promise<typeof photo>(() => {});
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) => {
      if (path === '/events/e1') return Promise.resolve(event);
      if (path === '/events/e1/photos')
        return uploadCalls().length === 1
          ? Promise.reject(new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'))
          : pending;
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await user.upload(
      await screen.findByLabelText('Clothing photo'),
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
    );
    await user.dblClick(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Uploading photo…')).toBeVisible();
    expect(screen.getByLabelText('Clothing photo')).toBeDisabled();
    expect(uploadCalls()).toHaveLength(2);
  });

  it('locks photo controls until the pending upload finishes', async () => {
    const user = userEvent.setup();
    let resolveUpload!: (value: typeof photo) => void;
    const pending = new Promise<typeof photo>((resolve) => {
      resolveUpload = resolve;
    });
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) => {
      if (path === '/events/e1') return Promise.resolve(event);
      if (path === '/events/e1/photos') return pending;
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    const input = await screen.findByLabelText('Clothing photo');
    const first = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    await user.upload(input, first);
    expect(input).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^(Try again|Change photo|Choose another photo)$/ }),
    ).not.toBeInTheDocument();
    await user.upload(input, new File(['b'], 'b.jpg', { type: 'image/jpeg' }));
    expect(uploadCalls()).toHaveLength(1);
    expect(uploadCalls()[0]?.[2].body.get('file')).toBe(first);
    await act(async () => resolveUpload(photo));
    expect(await screen.findByText('Photo ready')).toBeVisible();
    expect(screen.getByRole('img')).toHaveAttribute('src', photo.url);
    expect(uploadCalls()).toHaveLength(1);
  });

  it('clears the failed file context when a replacement is rejected locally', async () => {
    const user = userEvent.setup();
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) => {
      if (path === '/events/e1') return Promise.resolve(event);
      if (path === '/events/e1/photos')
        return Promise.reject(new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'));
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    const input = await screen.findByLabelText('Clothing photo');
    await user.upload(input, new File(['a'], 'a.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeVisible();
    await user.upload(
      input,
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a photo of 10 MB or less.');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose another photo' })).toBeVisible();
    expect(screen.queryByRole('img', { name: /preview/i })).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(1);
  });

  it('disables the ready photo step when the shared event closes', async () => {
    const user = userEvent.setup();
    let sharedEvent: Omit<typeof event, 'closedAt'> & { closedAt: string | null } = event;
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) => {
      if (path === '/events/e1') return Promise.resolve(sharedEvent);
      if (path === '/events/e1/photos') return Promise.resolve(photo);
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    const { queryClient } = renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await user.upload(
      await screen.findByLabelText('Clothing photo'),
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
    );
    expect(await screen.findByText('Photo ready')).toBeVisible();
    sharedEvent = { ...event, status: 'closed', closedAt: '2026-10-28T01:00:00Z' };
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['events', 'e1'] });
    });
    expect(await screen.findByText('This event has ended.')).toBeVisible();
    expect(screen.getByRole('img')).toHaveAttribute('src', photo.url);
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(uploadCalls()).toHaveLength(1);
  });
});
