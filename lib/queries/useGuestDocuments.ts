import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export interface GuestDocumentRow {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  category: string | null;
  created_at: string;
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
}

/**
 * Three-step upload flow:
 * 1. POST /sign → get signed_url + document_id
 * 2. PUT to signed_url with file bytes
 * 3. POST /complete to confirm
 */
export function useUploadGuestDocument(guestId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      signInput,
      fileUri,
    }: {
      signInput: SignDocumentInput;
      fileUri: string;
    }): Promise<void> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }

      // Step 1: Get signed URL
      const signRes = await apiFetch<SignDocumentResponse>(
        `/api/venue/guests/${guestId}/documents/sign`,
        {
          accessToken,
          method: 'POST',
          body: JSON.stringify(signInput),
        },
      );

      // Step 2: PUT the file bytes to the signed URL
      const fileResponse = await fetch(fileUri);
      const blob = await fileResponse.blob();
      const putRes = await fetch(signRes.signed_url, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': signInput.mime_type },
      });
      if (!putRes.ok) {
        throw new Error('Upload to storage failed');
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

/** GET /api/venue/guests/[guestId]/documents/[docId]/download — get pre-signed download URL. */
export async function fetchDocumentDownloadUrl(
  accessToken: string,
  guestId: string,
  docId: string,
): Promise<string> {
  const res = await apiFetch<{ url: string }>(
    `/api/venue/guests/${guestId}/documents/${docId}/download`,
    { accessToken },
  );
  return res.url;
}
