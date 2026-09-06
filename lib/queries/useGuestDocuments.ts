import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { checkGuestDocument } from '@/lib/guests/guest-document-limits';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * Storage upload timeout. Longer than apiFetch's 15s default because document
 * uploads carry the full file payload over a signed URL; without a cancel a
 * stalled upload never settles, so the upload button spins until the OS socket
 * times out.
 */
const UPLOAD_TIMEOUT_MS = 60_000;

/** The upload's time-box was hit, and the task cancelled. */
function uploadTimedOut(): ApiError {
  return new ApiError('Upload timed out. Check your connection and try again.', 408);
}

/**
 * What the storage service said when it refused the bytes: Supabase Storage
 * answers with JSON carrying `message` (and `error`, its code), which is what a
 * refusal needs to be diagnosable from the phone's own error text.
 */
function storageErrorMessage(body: string | null | undefined): string | null {
  if (!body) return null;
  try {
    const json = JSON.parse(body) as { message?: unknown; error?: unknown };
    const text =
      typeof json.message === 'string'
        ? json.message
        : typeof json.error === 'string'
          ? json.error
          : '';
    return text.trim() || null;
  } catch {
    return null;
  }
}

export interface GuestDocumentRow {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  category: string | null;
  created_at: string;
  uploaded_at?: string | null;
  /**
   * A short-lived signed link (15 minutes) for photos and PDFs, the thumbnail
   * the Records grid shows (web 2026-09-05); null for other files. Opening a
   * file asks for a fresh link with `intent=view`, which the audit records.
   */
  preview_url?: string | null;
}

export interface GuestDocumentsResponse {
  documents: GuestDocumentRow[];
}

/**
 * Whose guest the documents belong to. A linked venue's booking names the
 * partner as the owner venue (the guest is the partner's client), and every
 * documents route is asked with `owner_venue_id` so the server can resolve the
 * guest under that venue and apply the link grant, as the bookings list route
 * does for a partner's guest history. Empty for our own guests.
 */
export interface GuestDocumentScope {
  ownerVenueId?: string | null;
}

const documentsKey = (
  accessToken: string | null,
  guestId: string | null | undefined,
  ownerVenueId?: string | null,
) =>
  [
    ...queryKeys.guests.all(),
    'documents',
    keyScope(accessToken),
    guestId ?? null,
    ownerVenueId ?? null,
  ] as const;

/** A documents route path with the owner-venue scope (and any other query) appended. */
function documentsPath(
  path: string,
  ownerVenueId: string | null | undefined,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams(extra);
  if (ownerVenueId) params.set('owner_venue_id', ownerVenueId);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** GET /api/venue/guests/[guestId]/documents — list uploaded documents. */
export function useGuestDocuments(guestId: string | null | undefined, scope: GuestDocumentScope = {}) {
  const accessToken = useAccessToken();
  const ownerVenueId = scope.ownerVenueId ?? null;
  const enabled = isBackendConfigured() && accessToken !== null && Boolean(guestId);

  return useQuery({
    queryKey: documentsKey(accessToken, guestId, ownerVenueId),
    enabled,
    queryFn: async (): Promise<GuestDocumentsResponse> => {
      if (!accessToken || !guestId) {
        throw new Error('Missing documents parameters');
      }
      return apiFetch<GuestDocumentsResponse>(
        documentsPath(`/api/venue/guests/${guestId}/documents`, ownerVenueId),
        { accessToken },
      );
    },
  });
}

export interface SignDocumentInput {
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
}

export interface SignDocumentResponse {
  signed_url: string;
  document_id: string;
  /** The type the row was recorded with; sent as the PUT's Content-Type (web 2026-09-05). */
  mime_type?: string;
}

export interface UploadGuestDocumentInput {
  fileUri: string;
  fileName: string;
  /** What the picker reported; may be empty or generic, so the allowlist resolves by extension too. */
  mimeType: string | null | undefined;
  /** What the picker reported; the real byte count is read from the file before signing. */
  sizeBytes?: number | null;
}

/**
 * Three-step upload flow (web `ContactDocumentsSection.uploadOne`):
 * 1. POST /sign → get signed_url + document_id
 * 2. PUT the file's bytes to signed_url
 * 3. POST /complete to confirm
 *
 * The file's size is read from disk first, because a photo comes back
 * re-encoded by the picker and its reported size is not the upload's. Size and
 * type are then checked against the same rules the sign route and the bucket
 * apply (`checkGuestDocument`), so a refusal reads as a sentence naming the
 * file rather than a failed request; the route and the bucket check again.
 *
 * Step 2 goes through the native uploader (`expo-file-system`'s upload task),
 * which streams the file from disk as the request body with the headers given,
 * the way the browser PUTs the File itself. It used to `fetch()` the local file
 * into a Blob and PUT that through React Native's blob store: on the device
 * that PUT came back non-2xx ("Upload to storage failed") where the same
 * request succeeds in a browser, so the bytes no longer pass through the blob
 * store at all, and a refusal now carries the storage service's own status and
 * message rather than a bare "failed".
 */
export function useUploadGuestDocument(guestId: string, scope: GuestDocumentScope = {}) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const ownerVenueId = scope.ownerVenueId ?? null;

  return useMutation({
    mutationFn: async ({
      fileUri,
      fileName,
      mimeType,
      sizeBytes,
    }: UploadGuestDocumentInput): Promise<void> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }

      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) {
        throw new ApiError(`${fileName} could not be read from this device.`, 400);
      }
      const realSize = info.size > 0 ? info.size : (sizeBytes ?? 0);
      const accepted = checkGuestDocument({ fileName, mimeType, sizeBytes: realSize });
      if (!accepted.ok) {
        throw new ApiError(accepted.message, 400);
      }

      // Step 1: Get signed URL
      const signRes = await apiFetch<SignDocumentResponse>(
        documentsPath(`/api/venue/guests/${guestId}/documents/sign`, ownerVenueId),
        {
          accessToken,
          method: 'POST',
          body: JSON.stringify({
            file_name: fileName,
            mime_type: accepted.mimeType,
            file_size_bytes: realSize,
          } satisfies SignDocumentInput),
        },
      );

      // Step 2: PUT the file's bytes to the signed URL, streamed from disk by
      // the native uploader with the type the row was recorded with. Time-boxed
      // (mirrors apiFetch) so a stalled upload is cancelled instead of spinning
      // until the OS socket times out; a cancelled task settles empty.
      const task = FileSystem.createUploadTask(signRes.signed_url, fileUri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': signRes.mime_type ?? accepted.mimeType },
      });
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        void task.cancelAsync();
      }, UPLOAD_TIMEOUT_MS);
      let putRes: FileSystem.FileSystemUploadResult | null | undefined;
      try {
        putRes = await task.uploadAsync();
      } catch (err) {
        if (timedOut) throw uploadTimedOut();
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
      if (!putRes) {
        throw timedOut ? uploadTimedOut() : new ApiError('Upload was cancelled.', 499);
      }
      if (putRes.status < 200 || putRes.status >= 300) {
        const detail = storageErrorMessage(putRes.body);
        throw new ApiError(
          `Upload to storage failed (${putRes.status}${detail ? `: ${detail}` : ''}).`,
          putRes.status,
          detail ? { error: detail } : undefined,
        );
      }

      // Step 3: Mark upload as complete
      await apiFetch<unknown>(
        documentsPath(
          `/api/venue/guests/${guestId}/documents/${signRes.document_id}/complete`,
          ownerVenueId,
        ),
        { accessToken, method: 'POST' },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: documentsKey(accessToken, guestId, ownerVenueId),
      });
    },
  });
}

/** DELETE /api/venue/guests/[guestId]/documents/[docId] — remove a document. */
export function useDeleteGuestDocument(guestId: string, scope: GuestDocumentScope = {}) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const ownerVenueId = scope.ownerVenueId ?? null;

  return useMutation({
    mutationFn: async (docId: string): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(
        documentsPath(`/api/venue/guests/${guestId}/documents/${docId}`, ownerVenueId),
        { accessToken, method: 'DELETE' },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: documentsKey(accessToken, guestId, ownerVenueId),
      });
    },
  });
}

/**
 * GET /api/venue/guests/[guestId]/documents/[docId]/download — a fresh pre-signed
 * link. `intent: 'view'` marks the read as an in-app view (the Records viewer)
 * rather than a download, so the contact's audit trail says which happened
 * (web 2026-09-05).
 */
export async function fetchDocumentDownloadUrl(
  accessToken: string,
  guestId: string,
  docId: string,
  intent: 'view' | 'download' = 'download',
  scope: GuestDocumentScope = {},
): Promise<string> {
  const res = await apiFetch<{ url: string }>(
    documentsPath(
      `/api/venue/guests/${guestId}/documents/${docId}/download`,
      scope.ownerVenueId ?? null,
      intent === 'view' ? { intent: 'view' } : {},
    ),
    { accessToken },
  );
  return res.url;
}
