import { StrictMode } from 'react';

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PhotoUploadScreen } from '@/components/clothing/PhotoUploadScreen';
import { ApiError } from '@/lib/api/api-error';
import { saveEventSession } from '@/lib/session';
import { installMatchMedia } from '@/test/match-media';
import { renderWithClient } from '@/test/render';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), compressPhoto: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('@/lib/photo/compress', () => ({ compressPhoto: mocks.compressPhoto }));

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

  it('allows supported photo types and extensions in the picker', async () => {
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    expect(await screen.findByLabelText('Clothing photos')).toHaveAttribute(
      'accept',
      'image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    );
  });

  it('shows the empty photo step without uploading', async () => {
    renderWithClient(<PhotoUploadScreen eventId="e1" />);

    expect(await screen.findByLabelText('Clothing photos')).toHaveAttribute('type', 'file');
    expect(
      screen.getByText(
        'Add up to 10 JPG/JPEG, PNG, or WebP photos. Photos over 10 MB are compressed.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Clothing photos')).toBeEnabled();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);
  });

  it('keeps the empty step unchanged when the picker is cancelled', async () => {
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    const input = await screen.findByLabelText('Clothing photos');
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(screen.getByLabelText('Clothing photos')).toBeEnabled();
    expect(
      screen.getByText(
        'Add up to 10 JPG/JPEG, PNG, or WebP photos. Photos over 10 MB are compressed.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);
  });

  it('shows the existing access guidance for an unauthorized event query (regression guard)', async () => {
    mocks.apiFetch.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Unauthorized.'));
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    expect(await screen.findByText("You haven't joined this event on this device.")).toBeVisible();
    expect(screen.queryByLabelText('Clothing photos')).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);
  });

  it('shows the not-found guidance for a missing event (regression guard)', async () => {
    mocks.apiFetch.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Not here.'));
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    expect(await screen.findByText('This event could not be found.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to start' })).toBeVisible();
    expect(screen.queryByLabelText('Clothing photos')).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);
  });

  it('shows a retryable error when the event query fails', async () => {
    mocks.apiFetch.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'));
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'Server says no.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.queryByLabelText('Clothing photos')).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);
  });
});

describe('US1 display fallback', () => {
  it('shows a message and keeps removal enabled when the uploaded image fails to load', async () => {
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
    const user = userEvent.setup();
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await user.upload(
      await screen.findByLabelText('Clothing photos'),
      new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' }),
    );
    fireEvent.error(await screen.findByRole('img', { name: 'Uploaded clothing photo' }));

    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
    expect(screen.getByText('This photo could not be displayed.')).toBeVisible();
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
    await user.upload(await screen.findByLabelText('Clothing photos'), file);
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
      'HEIC',
      new File(['bytes'], 'photo.heic', { type: 'image/heic' }),
      'Use a JPG/JPEG, PNG, or WebP photo.',
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
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(uploadCalls()).toHaveLength(2));
    expect(uploadCalls()[1]?.[2].body.get('file')).toBe(file);
  });

  it('shows device access guidance when an upload is unauthorized (regression guard)', async () => {
    rejectUpload(new ApiError(401, 'UNAUTHENTICATED', 'Unauthorized.'));
    await chooseFile(userEvent.setup(), new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText("You haven't joined this event on this device.")).toBeVisible();
    expect(screen.getByRole('link', { name: 'Join with entry code' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to start' })).toBeVisible();
    expect(screen.queryByLabelText('Clothing photos')).not.toBeInTheDocument();
  });

  it('shows the not-found view when an upload cannot find the event (regression guard)', async () => {
    rejectUpload(new ApiError(404, 'NOT_FOUND', 'Not here.'));
    await chooseFile(userEvent.setup(), new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('This event could not be found.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to start' })).toBeVisible();
    expect(screen.queryByLabelText('Clothing photos')).not.toBeInTheDocument();
  });

  it('disables the photo step when an upload finds the event closed (regression guard)', async () => {
    rejectUpload(new ApiError(409, 'EVENT_CLOSED', 'Event closed.'));
    await chooseFile(userEvent.setup(), new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(screen.getByLabelText('Clothing photos')).toBeDisabled());
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
      expect(
        screen.queryByRole('img', { name: 'Uploaded clothing photo' }),
      ).not.toBeInTheDocument();
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
      await user.upload(await screen.findByLabelText('Clothing photos'), file);
      expect(await screen.findByRole('img', { name: 'Uploaded clothing photo' })).toBeVisible();
      first.unmount();

      rejectUpload(new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'));
      const second = renderWithClient(<PhotoUploadScreen eventId="e1" />);
      await user.upload(await screen.findByLabelText('Clothing photos'), file);
      await waitFor(() => expect(screen.getByLabelText('Clothing photos')).toBeEnabled());
      expect(uploadCalls()).toHaveLength(2);
      second.unmount();

      rejectUpload(new Error('boom'));
      const third = renderWithClient(<PhotoUploadScreen eventId="e1" />);
      await user.upload(await screen.findByLabelText('Clothing photos'), file);
      await waitFor(() => expect(screen.getByLabelText('Clothing photos')).toBeEnabled());
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
      await screen.findByLabelText('Clothing photos'),
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
    );
    expect(await screen.findByRole('img', { name: 'Uploaded clothing photo' })).toBeVisible();
    rerender(<PhotoUploadScreen eventId="e1" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', photo.url);
    expect(screen.queryByRole('button', { name: 'Change photo' })).not.toBeInTheDocument();
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
      await screen.findByLabelText('Clothing photos'),
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
    );
    await user.dblClick(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Uploading photo…')).toBeVisible();
    const remove = screen.queryByRole('button', { name: 'Remove' });
    if (remove) expect(remove).toBeDisabled();
    expect(uploadCalls()).toHaveLength(2);
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
      await screen.findByLabelText('Clothing photos'),
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
    );
    expect(await screen.findByRole('img', { name: 'Uploaded clothing photo' })).toBeVisible();
    sharedEvent = { ...event, status: 'closed', closedAt: '2026-10-28T01:00:00Z' };
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['events', 'e1'] });
    });
    await waitFor(() => expect(screen.getByLabelText('Clothing photos')).toBeDisabled());
    expect(screen.getByRole('img')).toHaveAttribute('src', photo.url);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('This photo could not be displayed.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(1);
  });

  it('does not render a duplicate banner when the shared event is closed', async () => {
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) => {
      if (path === '/events/e1')
        return Promise.resolve({ ...event, status: 'closed', closedAt: '2026-10-28T01:00:00Z' });
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    expect(await screen.findByLabelText('Clothing photos')).toBeDisabled();
    expect(screen.queryByText('This event has ended.')).not.toBeInTheDocument();
  });

  it('refetches the shared event when an upload reports closure', async () => {
    const user = userEvent.setup();
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) => {
      if (path === '/events/e1') return Promise.resolve(event);
      if (path === '/events/e1/photos')
        return Promise.reject(new ApiError(409, 'EVENT_CLOSED', 'Event closed.'));
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    const input = await screen.findByLabelText('Clothing photos');
    expect(mocks.apiFetch.mock.calls.filter((call) => call[1] === '/events/e1')).toHaveLength(1);
    await user.upload(input, new File(['a'], 'a.jpg', { type: 'image/jpeg' }));
    await waitFor(() =>
      expect(mocks.apiFetch.mock.calls.filter((call) => call[1] === '/events/e1')).toHaveLength(2),
    );
  });

  it('shows access guidance when an upload is unauthorized after the event closes', async () => {
    const user = userEvent.setup();
    let rejectUpload!: (error: Error) => void;
    const pending = new Promise<typeof photo>((_resolve, reject) => {
      rejectUpload = reject;
    });
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) => {
      if (path === '/events/e1') return Promise.resolve(event);
      if (path === '/events/e1/photos') return pending;
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    const { queryClient } = renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await user.upload(
      await screen.findByLabelText('Clothing photos'),
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
    );
    await act(async () => {
      queryClient.setQueryData(['events', 'e1'], {
        ...event,
        status: 'closed',
        closedAt: '2026-10-28T01:00:00Z',
      });
      rejectUpload(new ApiError(401, 'UNAUTHENTICATED', 'Unauthorized.'));
    });
    expect(await screen.findByText("You haven't joined this event on this device.")).toBeVisible();
  });
});

describe('US2 compression', () => {
  beforeEach(() => {
    localStorage.clear();
    saveEventSession('e1', { participantToken: 't', participantId: 'p2' });
    mocks.apiFetch.mockReset();
    mocks.compressPhoto.mockReset();
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

  it('prepares an oversized photo before uploading the compressed file', async () => {
    const file = new File([new Uint8Array(11 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });
    const compressed = new File(['compressed'], 'large.jpg', { type: 'image/jpeg' });
    let resolveCompression!: (result: { ok: true; file: File }) => void;
    mocks.compressPhoto.mockReturnValue(
      new Promise((resolve) => {
        resolveCompression = resolve;
      }),
    );
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    const input = await screen.findByLabelText('Clothing photos');
    await userEvent.setup().upload(input, file);
    expect(
      screen
        .getAllByRole('status')
        .filter((status) => status.textContent?.includes('Preparing photo…')),
    ).toHaveLength(1);
    expect(mocks.compressPhoto).toHaveBeenCalledWith(file);
    const remove = screen.queryByRole('button', { name: 'Remove' });
    if (remove) expect(remove).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);
    await act(async () => resolveCompression({ ok: true, file: compressed }));
    await waitFor(() => expect(uploadCalls()).toHaveLength(1));
    expect(uploadCalls()[0]?.[2].body.get('file')).toBe(compressed);
  });

  it('uploads a photo at the limit unchanged without compression', async () => {
    const file = new File([new Uint8Array(10485760)], 'photo.jpg', { type: 'image/jpeg' });
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await userEvent.setup().upload(await screen.findByLabelText('Clothing photos'), file);
    await waitFor(() => expect(uploadCalls()).toHaveLength(1));
    expect(mocks.compressPhoto).not.toHaveBeenCalled();
    expect(uploadCalls()[0]?.[2].body.get('file')).toBe(file);
  });

  it('shows a local error and offers another photo when compression fails', async () => {
    const message = 'This photo is too large. Choose a smaller photo.';
    mocks.compressPhoto.mockResolvedValue({ ok: false, message });
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await userEvent
      .setup()
      .upload(
        await screen.findByLabelText('Clothing photos'),
        new File([new Uint8Array(11 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' }),
      );
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(uploadCalls()).toHaveLength(0);
  });
});

describe('US4 multiple photos', () => {
  beforeEach(() => {
    localStorage.clear();
    saveEventSession('e1', { participantToken: 't', participantId: 'p2' });
    mocks.apiFetch.mockReset();
    mocks.compressPhoto.mockReset();
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) =>
      path === '/events/e1' ? Promise.resolve(event) : Promise.resolve(photo),
    );
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  const files = (count: number) =>
    Array.from(
      { length: count },
      (_, i) => new File([String(i)], `${i}.jpg`, { type: 'image/jpeg' }),
    );
  const result = (i: number) => ({
    ...photo,
    id: `ph${i}`,
    url: `https://cdn.example/photos/ph${i}`,
  });

  it('uploads in order with only one request in flight', async () => {
    const user = userEvent.setup();
    const resolvers: Array<(value: typeof photo) => void> = [];
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) =>
      path === '/events/e1'
        ? Promise.resolve(event)
        : new Promise((resolve) => resolvers.push(resolve)),
    );
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    const input = await screen.findByLabelText('Clothing photos');
    expect(input).toHaveAttribute('multiple');
    const selected = files(3);
    await user.upload(input, selected);
    expect(screen.getByText('3 / 10 photos')).toBeVisible();
    await waitFor(() => expect(uploadCalls()).toHaveLength(1));
    for (let i = 0; i < 3; i++) {
      expect(uploadCalls()[i]?.[2].body.get('file')).toBe(selected[i]);
      expect(uploadCalls()).toHaveLength(i + 1);
      const resolve = resolvers[i];
      if (!resolve) throw new Error(`Missing resolver for upload ${i}`);
      await act(async () => resolve(result(i)));
      if (i < 2) await waitFor(() => expect(uploadCalls()).toHaveLength(i + 2));
    }
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  });

  it('allows adding a photo while one upload is in progress', async () => {
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) =>
      path === '/events/e1' ? Promise.resolve(event) : new Promise(() => {}),
    );
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await userEvent.setup().upload(await screen.findByLabelText('Clothing photos'), files(1));
    await waitFor(() => expect(uploadCalls()).toHaveLength(1));
    expect(
      screen
        .getAllByRole('status')
        .filter((status) => status.textContent?.includes('Uploading photo…')),
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeEnabled();
  });

  it.each([
    [409, 'EVENT_CLOSED', 'closed'],
    [401, 'UNAUTHENTICATED', 'no-access'],
    [404, 'NOT_FOUND', 'not-found'],
  ])('stops the queue after an event-level %s failure', async (status, code, view) => {
    let rejectUpload: (error: Error) => void = () => {
      throw new Error('Upload has not started');
    };
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) =>
      path === '/events/e1'
        ? Promise.resolve(event)
        : new Promise((_resolve, reject) => {
            rejectUpload = reject;
          }),
    );
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await userEvent.setup().upload(await screen.findByLabelText('Clothing photos'), files(3));
    await waitFor(() => expect(uploadCalls()).toHaveLength(1));
    await act(async () => rejectUpload(new ApiError(status, code, 'Event unavailable.')));
    if (view === 'closed') {
      await waitFor(() => expect(screen.getByLabelText('Clothing photos')).toBeDisabled());
      expect(screen.queryByText('Uploading photo…')).not.toBeInTheDocument();
    } else if (view === 'no-access') {
      expect(
        await screen.findByText("You haven't joined this event on this device."),
      ).toBeVisible();
    } else {
      expect(await screen.findByText('This event could not be found.')).toBeVisible();
    }
    expect(uploadCalls()).toHaveLength(1);
  });

  it('does not start the next upload after the shared event closes in flight', async () => {
    let resolveUpload: (value: typeof photo) => void = () => {
      throw new Error('Upload has not started');
    };
    let eventData: Omit<typeof event, 'closedAt'> & { closedAt: string | null } = event;
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) =>
      path === '/events/e1'
        ? Promise.resolve(eventData)
        : new Promise((resolve) => {
            resolveUpload = resolve;
          }),
    );
    const { queryClient } = renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await userEvent.setup().upload(await screen.findByLabelText('Clothing photos'), files(3));
    await waitFor(() => expect(uploadCalls()).toHaveLength(1));
    eventData = { ...event, status: 'closed', closedAt: '2026-10-28T01:00:00Z' };
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['events', 'e1'] });
    });
    await waitFor(() => expect(screen.getByLabelText('Clothing photos')).toBeDisabled());
    await act(async () => resolveUpload(photo));
    expect(uploadCalls()).toHaveLength(1);
  });

  it('releases object URLs for files skipped beyond the limit', async () => {
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) =>
      path === '/events/e1' ? Promise.resolve(event) : new Promise(() => {}),
    );
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await userEvent.setup().upload(await screen.findByLabelText('Clothing photos'), files(12));
    expect(screen.getByText('10 / 10 photos')).toBeVisible();
    const created = vi.mocked(URL.createObjectURL).mock.results.map((result) => result.value);
    const held = screen.getAllByRole('img').map((img) => img.getAttribute('src'));
    const revoked = vi.mocked(URL.revokeObjectURL).mock.calls.map(([url]) => url);
    expect(created.length).toBeGreaterThanOrEqual(10);
    for (const url of created.filter((url) => !held.includes(url))) expect(revoked).toContain(url);
  });

  it('associates a local input error with the file input', async () => {
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    const input = await screen.findByLabelText('Clothing photos');
    await userEvent
      .setup({ applyAccept: false })
      .upload(input, new File(['x'], 'photo.heic', { type: 'image/heic' }));
    const message = 'Use a JPG/JPEG, PNG, or WebP photo.';
    expect(await screen.findByText(message)).toBeVisible();
    const ids = input.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
    expect(ids.some((id) => document.getElementById(id)?.textContent?.includes(message))).toBe(
      true,
    );
  });

  it('starts exactly one upload in Strict Mode', async () => {
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) =>
      path === '/events/e1' ? Promise.resolve(event) : new Promise(() => {}),
    );
    renderWithClient(
      <StrictMode>
        <PhotoUploadScreen eventId="e1" />
      </StrictMode>,
    );
    await userEvent.setup().upload(await screen.findByLabelText('Clothing photos'), files(1));
    await waitFor(() => expect(uploadCalls()).toHaveLength(1));
    expect(uploadCalls()).toHaveLength(1);
  });

  it('caps additions at ten and reports the skipped files', async () => {
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) =>
      path === '/events/e1' ? Promise.resolve(event) : new Promise(() => {}),
    );
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await userEvent.setup().upload(await screen.findByLabelText('Clothing photos'), files(12));
    expect(screen.getByText('10 / 10 photos')).toBeVisible();
    expect(screen.getByText('2 photos were not added because the limit is 10.')).toBeVisible();
    expect(screen.getByText('You have added 10 photos, the maximum.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeDisabled();
  });

  it('locks the active item but removes waiting and ready items', async () => {
    let resolve!: (value: typeof photo) => void;
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) =>
      path === '/events/e1'
        ? Promise.resolve(event)
        : new Promise((r) => {
            resolve = r;
          }),
    );
    const user = userEvent.setup();
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await user.upload(await screen.findByLabelText('Clothing photos'), files(2));
    await waitFor(() => expect(uploadCalls()).toHaveLength(1));
    const removes = screen.getAllByRole('button', { name: 'Remove' });
    expect(removes.filter((button) => !button.hasAttribute('disabled'))).toHaveLength(1);
    const waitingRemove = removes.find((button) => !button.hasAttribute('disabled'));
    if (!waitingRemove) throw new Error('Waiting item has no enabled Remove button');
    await user.click(waitingRemove);
    expect(screen.getByText('1 / 10 photos')).toBeVisible();
    await act(async () => resolve(result(0)));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(screen.getByText('0 / 10 photos')).toBeVisible();
  });

  it('isolates a failed upload, continues the queue, and enables Next after retry', async () => {
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) => {
      if (path === '/events/e1') return Promise.resolve(event);
      const count = uploadCalls().length;
      return count === 1
        ? Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'Network unavailable.'))
        : Promise.resolve(result(count));
    });
    const user = userEvent.setup();
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    const selected = files(3);
    await user.upload(await screen.findByLabelText('Clothing photos'), selected);
    await waitFor(() => expect(uploadCalls()).toHaveLength(3));
    expect(screen.getByText('Network unavailable.')).toBeVisible();
    expect(
      screen.getByText('Some photos failed to upload. Try again or remove them.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(uploadCalls().map((call) => call[2].body.get('file'))).toEqual(selected);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(uploadCalls()).toHaveLength(4));
    expect(uploadCalls()[3]?.[2].body.get('file')).toBe(selected[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  });

  it('shows ordered photos on Details and preserves them on Back', async () => {
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) =>
      path === '/events/e1'
        ? Promise.resolve(event)
        : Promise.resolve(result(uploadCalls().length)),
    );
    const user = userEvent.setup();
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await user.upload(await screen.findByLabelText('Clothing photos'), files(3));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 2 of 2: Details')).toBeVisible();
    expect(screen.getByText('Main photo')).toBeVisible();
    expect(
      screen.getByText('You will describe your clothing and register it here in the next update.'),
    ).toBeVisible();
    expect(screen.getAllByRole('img').map((img) => img.getAttribute('src'))).toEqual([
      result(1).url,
      result(2).url,
      result(3).url,
    ]);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('3 / 10 photos')).toBeVisible();
    expect(uploadCalls()).toHaveLength(3);
  });
});

describe('US1 carousel', () => {
  let restoreMatchMedia: () => void;
  const files = (count: number) =>
    Array.from(
      { length: count },
      (_, i) => new File([String(i)], `${i}.jpg`, { type: 'image/jpeg' }),
    );

  beforeEach(() => {
    restoreMatchMedia = installMatchMedia();
    localStorage.clear();
    saveEventSession('e1', { participantToken: 't', participantId: 'p2' });
    mocks.apiFetch.mockReset();
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) =>
      path === '/events/e1' ? Promise.resolve(event) : new Promise(() => {}),
    );
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
        revokeObjectURL: vi.fn(),
      }),
    );
  });
  afterEach(() => restoreMatchMedia());

  it('shows ordered slides and updates the position on scroll', async () => {
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await userEvent.setup().upload(await screen.findByLabelText('Clothing photos'), files(3));
    const region = screen.getByRole('region', { name: 'Photo carousel' });
    const slides = [1, 2, 3].map((n) => within(region).getByLabelText(`Photo ${n} of 3`));
    expect(slides.map((slide) => within(slide).getByRole('img').getAttribute('src'))).toEqual([
      'blob:0.jpg',
      'blob:1.jpg',
      'blob:2.jpg',
    ]);
    expect(within(region).getByText('3 / 3')).toBeVisible();
    const scroller = within(region).getByTestId('photo-carousel-scroller');
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(scroller, 'scrollLeft', { configurable: true, writable: true, value: 0 });
    fireEvent.scroll(scroller);
    expect(within(region).getByText('1 / 3')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next' })).toBeVisible();
  });

  it('omits the position for one photo', async () => {
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await userEvent.setup().upload(await screen.findByLabelText('Clothing photos'), files(1));
    const region = screen.getByRole('region', { name: 'Photo carousel' });
    expect(within(region).getByLabelText('Photo 1 of 1')).toBeInTheDocument();
    expect(within(region).queryByText(/^\d+ \/ \d+$/)).not.toBeInTheDocument();
  });

  it('keeps waiting and uploading actions on their own slides', async () => {
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await userEvent.setup().upload(await screen.findByLabelText('Clothing photos'), files(3));
    const region = screen.getByRole('region', { name: 'Photo carousel' });
    const first = within(region).getByLabelText('Photo 1 of 3');
    const second = within(region).getByLabelText('Photo 2 of 3');
    const third = within(region).getByLabelText('Photo 3 of 3');
    expect(within(first).getByText('Uploading photo…')).toBeVisible();
    expect(within(first).getByRole('button', { name: 'Remove' })).toBeDisabled();
    for (const slide of [second, third]) {
      expect(within(slide).getByText('Waiting')).toBeVisible();
      expect(within(slide).getByRole('button', { name: 'Remove' })).toBeEnabled();
      expect(within(slide).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    }
  });

  it('keeps retry and remove on the failed slide', async () => {
    mocks.apiFetch.mockImplementation((_eventId: string, path: string) =>
      path === '/events/e1'
        ? Promise.resolve(event)
        : Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'Network unavailable.')),
    );
    renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await userEvent.setup().upload(await screen.findByLabelText('Clothing photos'), files(1));
    await screen.findByText('Network unavailable.');
    const slide = within(screen.getByRole('region', { name: 'Photo carousel' })).getByLabelText(
      'Photo 1 of 1',
    );
    expect(within(slide).getByText('Network unavailable.')).toBeVisible();
    expect(within(slide).getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(within(slide).getByRole('button', { name: 'Remove' })).toBeEnabled();
  });

  it('keeps slides but hides actions when the event closes', async () => {
    const { queryClient } = renderWithClient(<PhotoUploadScreen eventId="e1" />);
    await userEvent.setup().upload(await screen.findByLabelText('Clothing photos'), files(3));
    await act(async () => {
      queryClient.setQueryData(['events', 'e1'], {
        ...event,
        status: 'closed',
        closedAt: '2026-10-28T01:00:00Z',
      });
    });
    const region = screen.getByRole('region', { name: 'Photo carousel' });
    for (const n of [1, 2, 3])
      expect(within(region).getByLabelText(`Photo ${n} of 3`)).toBeInTheDocument();
    expect(within(region).getAllByRole('img')).toHaveLength(3);
    for (const name of ['Remove', 'Try again', 'Add photo', 'Next']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(uploadCalls()).toHaveLength(1);
  });
});
