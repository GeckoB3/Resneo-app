import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { checkGuestDocument } from '@/lib/guests/guest-document-limits';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * Storage upload timeout. Longer than apiFetch's 15s default because document
 * uploads carry the full file payload over a signed URL; without an abort a
 * stalled PUT never rejects, so the upload button spins until the OS socket
 * times out.
 */
const UPLOAD_TIMEOUT_MS = 60_000;

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

const documentsKey = (accessToken: string | null, guestId: string | null | undefined) =>
  [...queryKeys.guests.all(), 'documents', keyScope(accessToken), guestId ?? null] as const;

/** GET /api/venue/guests/[guestId]/documents — list uploaded documents. */
export function useGuestDocuments(guestId: string | null | undefined) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && Boolean(guestId);

  return useQuery({
    queryKey: documentsKey(accessToken, guestId),
    enabled,
    queryFn: async (): Promise<GuestDocumentsResponse> => {
      if (!accessToken || !guestId) {
        throw new Error('Missing documents parameters');
      }
      return apiFetch<GuestDocumentsResponse>(`/api/venue/guests/${guestId}/documents`, {
        accessToken,
      });
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
 * Three-step upload flow:
 * 1. POST /sign → get signed_url + document_id
 * 2. PUT to signed_url with file bytes
 * 3. POST /complete to confirm
 *
 * The file is read first, because a photo comes back re-encoded by the picker
 * and its reported size is not the upload's. Size and type are then checked
 * against the same rules the sign route and the bucket apply
 * (`checkGuestDocument`), so a refusal reads as a sentence naming the file
 * rather than a failed request; the route and the bucket check again.
 */
export function useUploadGuestDocument(guestId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

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

      const fileResponse = await fetch(fileUri);
      const blob = await fileResponse.blob();
      const realSize = blob.size > 0 ? blob.size : (sizeBytes ?? 0);
      const accepted = checkGuestDocument({ fileName, mimeType, sizeBytes: realSize });
      if (!accepted.ok) {
        throw new ApiError(accepted.message, 400);
      }

      // Step 1: Get signed URL
      const signRes = await apiFetch<SignDocumentResponse>(
        `/api/venue/guests/${guestId}/documents/sign`,
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

      // Step 2: PUT the file bytes to the signed URL. Time-box it with an
      // AbortController (mirrors apiFetch) so a stalled upload rejects instead
      // of spinning until the OS socket times out.
      const controller = new AbortController();
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, UPLOAD_TIMEOUT_MS);
      let putRes: Response;
      try {
        putRes = await fetch(signRes.signed_url, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': signRes.mime_type ?? accepted.mimeType },
          signal: controller.signal,
        });
      } catch (err) {
        if (timedOut) {
          throw new ApiError('Upload timed out. Check your connection and try again.', 408);
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
      if (!putRes.ok) {
        throw new ApiError('Upload to storage failed', putRes.status);
      }

      // Step 3: Mark upload as complete
      await apiFetch<unknown>(
        `/api/venue/guests/${guestId}/documents/${signRes.document_id}/complete`,
        { accessToken, method: 'POST' },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: documentsKey(accessToken, guestId),
      });
    },
  });
}

/** DELETE /api/venue/guests/[guestId]/documents/[docId] — remove a document. */
export function useDeleteGuestDocument(guestId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (docId: string): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(`/api/venue/guests/${guestId}/documents/${docId}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: documentsKey(accessToken, guestId),
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
): Promise<string> {
  const res = await apiFetch<{ url: string }>(
    `/api/venue/guests/${guestId}/documents/${docId}/download${intent === 'view' ? '?intent=view' : ''}`,
    { accessToken },
  );
  return res.url;
}
