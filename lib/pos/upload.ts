import { ApiError } from '@/lib/api/client';
import { formDataFile } from '@/lib/api/form-data-file';
import { getApiUrl } from '@/lib/env';
import { posHeaders } from '@/lib/pos/api';

/** Time box for a photo upload: longer than a JSON call. */
const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * One photo to a POS route as multipart `file` (JPG, PNG or WebP), as the product photo upload
 * does: a raw fetch, because `apiFetch` cannot carry FormData, and the file through
 * `formDataFile`. A refusal is the server's sentence.
 */
export async function posPhotoUpload<T>(
  path: string,
  accessToken: string,
  file: { uri: string; mimeType: string },
  name: string,
): Promise<T> {
  const ext = file.mimeType === 'image/png' ? 'png' : file.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const form = new FormData();
  form.append('file', formDataFile(file.uri, `${name}.${ext}`, file.mimeType));
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, UPLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...posHeaders() },
      body: form,
      signal: controller.signal,
    });
  } catch {
    if (timedOut) throw new ApiError('The upload timed out. Check your connection and try again.', 408);
    throw new ApiError('Network request failed. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Upload failed (${response.status})`;
    throw new ApiError(message, response.status, data);
  }
  return data as T;
}
