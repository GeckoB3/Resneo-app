/**
 * Upload contract for a contact's Records (the sign → PUT → complete flow the
 * web's `ContactDocumentsSection.uploadOne` runs): the size comes from the file
 * on disk, the sign call records that size and the resolved type, the bytes go
 * to the signed URL through the native uploader as a PUT with that type, and a
 * refusal by the storage service surfaces its status and message.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();
jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

// The native uploader (expo-file-system's legacy API): an upload task whose
// `uploadAsync` answers with the storage service's status and body.
const mockGetInfoAsync = jest.fn();
const mockUploadAsync = jest.fn();
const mockCancelAsync = jest.fn();
const mockCreateUploadTask = jest.fn();
jest.mock(
  'expo-file-system/legacy',
  () => ({
    FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
    getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
    createUploadTask: (...args: unknown[]) => {
      mockCreateUploadTask(...args);
      return {
        uploadAsync: () => mockUploadAsync(),
        cancelAsync: () => mockCancelAsync(),
      };
    },
  }),
  { virtual: true },
);

import { useUploadGuestDocument } from '@/lib/queries/useGuestDocuments';

const SIGNED_URL =
  'https://example.supabase.co/storage/v1/object/upload/sign/guest-documents/v1/g1/d1/IMG_0001.jpg?token=t';

const FILE = {
  fileUri: 'file:///cache/ImagePicker/abc.jpg',
  fileName: 'IMG_0001.jpg',
  mimeType: 'image/jpeg',
  // What the picker reported; the upload signs with the size on disk instead.
  sizeBytes: 999,
};

function makeWrapper() {
  // gcTime 0: the default five-minute garbage-collection timers would keep the
  // Jest process alive after the run.
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

async function renderUpload() {
  return renderHook(() => useUploadGuestDocument('guest-1'), { wrapper: makeWrapper() });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockGetInfoAsync.mockReset();
  mockUploadAsync.mockReset();
  mockCancelAsync.mockReset();
  mockCreateUploadTask.mockReset();
  mockGetInfoAsync.mockResolvedValue({
    exists: true,
    uri: FILE.fileUri,
    size: 123456,
    isDirectory: false,
    modificationTime: 0,
  });
  mockApiFetch.mockImplementation(async (path: string) =>
    path.endsWith('/documents/sign')
      ? { signed_url: SIGNED_URL, document_id: 'd1', mime_type: 'image/jpeg' }
      : { success: true },
  );
  mockUploadAsync.mockResolvedValue({
    status: 200,
    headers: {},
    body: '{"Key":"guest-documents/v1/g1/d1/IMG_0001.jpg"}',
    mimeType: null,
  });
});

describe('useUploadGuestDocument', () => {
  it('signs with the size on disk, PUTs the file through the native uploader with the recorded type, then completes', async () => {
    const { result } = await renderUpload();
    await act(async () => {
      await result.current.mutateAsync(FILE);
    });

    expect(mockApiFetch).toHaveBeenNthCalledWith(
      1,
      '/api/venue/guests/guest-1/documents/sign',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          file_name: 'IMG_0001.jpg',
          mime_type: 'image/jpeg',
          file_size_bytes: 123456,
        }),
      }),
    );
    expect(mockCreateUploadTask).toHaveBeenCalledWith(SIGNED_URL, FILE.fileUri, {
      httpMethod: 'PUT',
      uploadType: 0,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      2,
      '/api/venue/guests/guest-1/documents/d1/complete',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it("surfaces the storage service's status and message when it refuses the bytes, and does not complete", async () => {
    mockUploadAsync.mockResolvedValue({
      status: 400,
      headers: {},
      body: JSON.stringify({
        statusCode: '400',
        error: 'InvalidMimeType',
        message: 'mime type image/bmp is not supported',
      }),
      mimeType: null,
    });
    const { result } = await renderUpload();
    await act(async () => {
      await expect(result.current.mutateAsync(FILE)).rejects.toMatchObject({
        message: 'Upload to storage failed (400: mime type image/bmp is not supported).',
        status: 400,
      });
    });
    // Signed, but never marked complete.
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a bare status when the storage answer is not JSON', async () => {
    mockUploadAsync.mockResolvedValue({ status: 502, headers: {}, body: '<html>', mimeType: null });
    const { result } = await renderUpload();
    await act(async () => {
      await expect(result.current.mutateAsync(FILE)).rejects.toMatchObject({
        message: 'Upload to storage failed (502).',
        status: 502,
      });
    });
  });

  it('refuses a file that is not on disk before signing anything', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false, uri: FILE.fileUri, isDirectory: false });
    const { result } = await renderUpload();
    await act(async () => {
      await expect(result.current.mutateAsync(FILE)).rejects.toMatchObject({
        message: 'IMG_0001.jpg could not be read from this device.',
        status: 400,
      });
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockCreateUploadTask).not.toHaveBeenCalled();
  });

  it('falls back to the picked size when the file reports none', async () => {
    mockGetInfoAsync.mockResolvedValue({
      exists: true,
      uri: FILE.fileUri,
      size: 0,
      isDirectory: false,
      modificationTime: 0,
    });
    const { result } = await renderUpload();
    await act(async () => {
      await result.current.mutateAsync(FILE);
    });
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      1,
      '/api/venue/guests/guest-1/documents/sign',
      expect.objectContaining({ body: expect.stringContaining('"file_size_bytes":999') }),
    );
  });

  it('cancels a stalled upload at the time-box and reports a timeout', async () => {
    jest.useFakeTimers();
    try {
      let settle: ((value: unknown) => void) | null = null;
      mockUploadAsync.mockImplementation(
        () =>
          new Promise((resolve) => {
            settle = resolve;
          }),
      );
      // A cancelled task settles empty.
      mockCancelAsync.mockImplementation(async () => {
        settle?.(null);
      });
      const { result } = await renderUpload();
      const pending = result.current.mutateAsync(FILE);
      // Swallow the rejection until the assertion below reads it.
      pending.catch(() => {});
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60_000);
      });
      expect(mockCancelAsync).toHaveBeenCalledTimes(1);
      await act(async () => {
        await expect(pending).rejects.toMatchObject({
          message: 'Upload timed out. Check your connection and try again.',
          status: 408,
        });
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
