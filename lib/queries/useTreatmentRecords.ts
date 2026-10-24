import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';

import { ApiError, apiErrorCode, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { downloadAndShareFile } from '@/lib/share/share-binary-file';
import type {
  ClientAlert,
  TreatmentEditorContext,
  TreatmentPhotoLabel,
  TreatmentProductLine,
  TreatmentRecordDetail,
  TreatmentRecordSaveResult,
  TreatmentRecordsListResponse,
  TreatmentRecordsSwitchState,
  TreatmentSuggestions,
  TreatmentVersionsResponse,
} from '@/types/treatment-records';

/**
 * Treatment records over the web's `/api/venue/treatment-records` routes (web plan §7.2, §9).
 *
 * A refusal that means "no records here for this person" renders nothing rather than an error, as
 * the compliance hooks do with 402 and 403: the feature off at the owning venue (`feature_disabled`),
 * no access (`TREATMENT_RECORDS_NO_ACCESS`), or a plain 403.
 */

const BASE = '/api/venue/treatment-records';

/** Upload time-box, as for guest documents: a photo carries its whole payload over a signed URL. */
const UPLOAD_TIMEOUT_MS = 60_000;

export function isTreatmentNoAccess(error: unknown): boolean {
  const code = apiErrorCode(error);
  if (code === 'feature_disabled' || code === 'TREATMENT_RECORDS_NO_ACCESS') return true;
  return error instanceof ApiError && (error.status === 402 || error.status === 403) && (code === null || code === 'FORBIDDEN');
}

const noRetryOnRefusal = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
};

function scopeQuery(scope: { bookingId?: string | null; guestId?: string | null }): string {
  if (scope.bookingId) return `booking_id=${encodeURIComponent(scope.bookingId)}`;
  return `guest_id=${encodeURIComponent(scope.guestId ?? '')}`;
}

/** The records for a booking (booking detail) or a client (client screen). Null: not for this person. */
export function useTreatmentRecordsList(scope: { bookingId?: string | null; guestId?: string | null }, enabled = true) {
  const accessToken = useAccessToken();
  const hasScope = Boolean(scope.bookingId || scope.guestId);
  return useQuery({
    queryKey: queryKeys.treatmentRecords.list(accessToken, scope),
    enabled: enabled && hasScope && isBackendConfigured() && accessToken !== null,
    retry: noRetryOnRefusal,
    queryFn: async (): Promise<TreatmentRecordsListResponse | null> => {
      if (!accessToken) throw new Error('Missing access token');
      try {
        return await apiFetch<TreatmentRecordsListResponse>(`${BASE}?${scopeQuery(scope)}`, { accessToken });
      } catch (error) {
        if (isTreatmentNoAccess(error)) return null;
        throw error;
      }
    },
  });
}

export function useTreatmentRecord(recordId: string | null) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: queryKeys.treatmentRecords.detail(accessToken, recordId),
    enabled: Boolean(recordId) && isBackendConfigured() && accessToken !== null,
    retry: noRetryOnRefusal,
    // The editor seeds its draft from this once, so a refetch on focus would change nothing; and the
    // copy is dropped when the screen closes, so opening the record again always starts from the
    // server's latest version rather than one the next save would conflict with.
    staleTime: Infinity,
    gcTime: 0,
    queryFn: async (): Promise<TreatmentRecordDetail> => {
      if (!accessToken || !recordId) throw new Error('Missing record');
      return apiFetch<TreatmentRecordDetail>(`${BASE}/${recordId}`, { accessToken });
    },
  });
}

/** A record, fetched fresh (the editor's Reload after a conflict). */
export async function fetchTreatmentRecord(accessToken: string, recordId: string): Promise<TreatmentRecordDetail> {
  return apiFetch<TreatmentRecordDetail>(`${BASE}/${recordId}`, { accessToken });
}

/** What the editor needs before a record exists: the client, starter text, forms, choices. */
export function useTreatmentContext(scope: { bookingId?: string | null; guestId?: string | null }, enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: queryKeys.treatmentRecords.context(accessToken, scope),
    enabled: enabled && Boolean(scope.bookingId || scope.guestId) && isBackendConfigured() && accessToken !== null,
    retry: noRetryOnRefusal,
    queryFn: async (): Promise<TreatmentEditorContext> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<TreatmentEditorContext>(`${BASE}/context?${scopeQuery(scope)}`, { accessToken });
    },
  });
}

export function useTreatmentSuggestions(ownerVenueId: string | null, enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: queryKeys.treatmentRecords.suggestions(accessToken, ownerVenueId),
    enabled: enabled && isBackendConfigured() && accessToken !== null,
    retry: noRetryOnRefusal,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TreatmentSuggestions> => {
      if (!accessToken) throw new Error('Missing access token');
      const q = ownerVenueId ? `?owner_venue_id=${encodeURIComponent(ownerVenueId)}` : '';
      return apiFetch<TreatmentSuggestions>(`${BASE}/suggestions${q}`, { accessToken });
    },
  });
}

export function useTreatmentVersions(recordId: string | null, enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: queryKeys.treatmentRecords.versions(accessToken, recordId),
    enabled: enabled && Boolean(recordId) && isBackendConfigured() && accessToken !== null,
    retry: noRetryOnRefusal,
    queryFn: async (): Promise<TreatmentVersionsResponse> => {
      if (!accessToken || !recordId) throw new Error('Missing record');
      return apiFetch<TreatmentVersionsResponse>(`${BASE}/${recordId}/versions`, { accessToken });
    },
  });
}

/** The client's alerts (TR24). Null: this person does not reach treatment records here. */
export function useClientAlerts(guestId: string | null, enabled = true, withRemoved = false) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: queryKeys.treatmentRecords.alerts(accessToken, guestId, withRemoved),
    enabled: enabled && Boolean(guestId) && isBackendConfigured() && accessToken !== null,
    retry: noRetryOnRefusal,
    queryFn: async (): Promise<ClientAlert[] | null> => {
      if (!accessToken || !guestId) throw new Error('Missing client');
      try {
        const out = await apiFetch<{ alerts: ClientAlert[] }>(
          `${BASE}/alerts?guest_id=${encodeURIComponent(guestId)}${withRemoved ? '&removed=1' : ''}`,
          { accessToken },
        );
        return out.alerts;
      } catch (error) {
        if (isTreatmentNoAccess(error)) return null;
        throw error;
      }
    },
  });
}

export function useAddClientAlert(guestId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ alert: ClientAlert }>(`${BASE}/alerts`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ guest_id: guestId, text }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.treatmentRecords.all(), 'alerts'] });
    },
  });
}

export function useRemoveClientAlert() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<unknown>(`${BASE}/alerts/${alertId}`, { accessToken, method: 'DELETE' });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.treatmentRecords.all(), 'alerts'] });
    },
  });
}

export interface CreateTreatmentRecordInput {
  guest_id: string;
  booking_id?: string | null;
  note?: string;
  treated_at?: string | null;
  practitioner_calendar_id?: string | null;
  products?: TreatmentProductLine[];
  copy_from_record_id?: string | null;
}

export async function createTreatmentRecord(accessToken: string, input: CreateTreatmentRecordInput): Promise<TreatmentRecordDetail> {
  return apiFetch<TreatmentRecordDetail>(BASE, { accessToken, method: 'POST', body: JSON.stringify(input) });
}

/** An autosave: each key present is a change, against the version it edited (web plan §6.8). */
export async function saveTreatmentRecord(
  accessToken: string,
  recordId: string,
  body: { version: number } & Record<string, unknown>,
): Promise<TreatmentRecordSaveResult> {
  return apiFetch<TreatmentRecordSaveResult>(`${BASE}/${recordId}`, { accessToken, method: 'PATCH', body: JSON.stringify(body) });
}

export async function deleteTreatmentRecord(accessToken: string, recordId: string, reason: string | null): Promise<void> {
  await apiFetch<unknown>(`${BASE}/${recordId}`, { accessToken, method: 'DELETE', body: JSON.stringify({ reason }) });
}

/** The three-step photo upload (sign, binary PUT from disk, complete), as for guest documents. */
export async function uploadTreatmentPhoto(
  accessToken: string,
  recordId: string,
  photo: { uri: string; mimeType: string; label?: TreatmentPhotoLabel },
): Promise<{ photoId: string }> {
  const info = await FileSystem.getInfoAsync(photo.uri);
  if (!info.exists) throw new ApiError('This photo could not be read from this device.', 400);
  const size = info.size > 0 ? info.size : 0;
  const signed = await apiFetch<{ photo_id: string; signed_url: string; mime_type: string }>(`${BASE}/${recordId}/photos/sign`, {
    accessToken,
    method: 'POST',
    body: JSON.stringify({ mime_type: photo.mimeType, file_size_bytes: size, label: photo.label ?? 'other' }),
  });

  const task = FileSystem.createUploadTask(signed.signed_url, photo.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': signed.mime_type ?? photo.mimeType },
  });
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    void task.cancelAsync();
  }, UPLOAD_TIMEOUT_MS);
  let put: FileSystem.FileSystemUploadResult | null | undefined;
  try {
    put = await task.uploadAsync();
  } catch (err) {
    put = null;
    if (!timedOut) {
      await removeTreatmentPhoto(accessToken, recordId, signed.photo_id).catch(() => undefined);
      throw err;
    }
  } finally {
    clearTimeout(timeoutId);
  }
  if (!put || put.status < 200 || put.status >= 300) {
    // An upload that did not arrive is deleted at once, so it never shows half there.
    await removeTreatmentPhoto(accessToken, recordId, signed.photo_id).catch(() => undefined);
    throw new ApiError(
      timedOut ? 'Upload timed out. Check your connection and try again.' : 'A photo did not upload. Check your connection and try again.',
      put?.status ?? 408,
    );
  }
  await apiFetch<unknown>(`${BASE}/${recordId}/photos/${signed.photo_id}/complete`, { accessToken, method: 'POST', body: '{}' });
  return { photoId: signed.photo_id };
}

export async function labelTreatmentPhoto(accessToken: string, recordId: string, photoId: string, label: TreatmentPhotoLabel): Promise<void> {
  await apiFetch<unknown>(`${BASE}/${recordId}/photos/${photoId}`, { accessToken, method: 'PATCH', body: JSON.stringify({ label }) });
}

export async function removeTreatmentPhoto(accessToken: string, recordId: string, photoId: string): Promise<void> {
  await apiFetch<unknown>(`${BASE}/${recordId}/photos/${photoId}`, { accessToken, method: 'DELETE' });
}

/** A full-size view link for one photo, lasting a few minutes. */
export async function fetchTreatmentPhotoUrl(accessToken: string, recordId: string, photoId: string): Promise<string> {
  const out = await apiFetch<{ url: string }>(`${BASE}/${recordId}/photos/${photoId}`, { accessToken });
  return out.url;
}

/** Print: the PDF link the server builds, then the share sheet (web plan §9). */
export async function shareTreatmentPdf(
  accessToken: string,
  query: { recordId?: string; guestId?: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const qs = query.recordId ? `record_id=${encodeURIComponent(query.recordId)}` : `guest_id=${encodeURIComponent(query.guestId ?? '')}`;
  const out = await apiFetch<{ url: string }>(`${BASE}/pdf?${qs}`, { accessToken });
  const result = await downloadAndShareFile({
    url: out.url,
    filename: query.recordId ? 'treatment-record.pdf' : 'treatment-records.pdf',
    mimeType: 'application/pdf',
    headers: {},
    dialogTitle: query.recordId ? 'Treatment record' : 'Treatment records',
  });
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

/** The switch's state and the linked venues the dialog names (web plan TR3). */
export function useTreatmentRecordsSwitchState(enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: queryKeys.treatmentRecords.switchState(accessToken),
    enabled: enabled && isBackendConfigured() && accessToken !== null,
    retry: noRetryOnRefusal,
    queryFn: async (): Promise<TreatmentRecordsSwitchState> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<TreatmentRecordsSwitchState>(`${BASE}/switch`, { accessToken });
    },
  });
}

export function useSwitchTreatmentRecords() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (on: boolean): Promise<{ treatment_records_enabled: boolean }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ treatment_records_enabled: boolean }>(`${BASE}/switch`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify(on ? { on: true, acknowledged: true } : { on: false }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.treatmentRecords.all() });
    },
  });
}

/** What erasing a client also removes (GET /api/venue/gdpr/erase-guest?guest_id=, admins). */
export function useEraseHeldCounts(guestId: string | null, enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: queryKeys.treatmentRecords.eraseCounts(accessToken, guestId),
    enabled: enabled && Boolean(guestId) && isBackendConfigured() && accessToken !== null,
    retry: false,
    queryFn: async (): Promise<{ treatment_records: number; client_alerts: number } | null> => {
      if (!accessToken || !guestId) throw new Error('Missing client');
      try {
        const out = await apiFetch<{ treatment_records?: number; client_alerts?: number }>(
          `/api/venue/gdpr/erase-guest?guest_id=${encodeURIComponent(guestId)}`,
          { accessToken },
        );
        return { treatment_records: out.treatment_records ?? 0, client_alerts: out.client_alerts ?? 0 };
      } catch {
        // An older server has no GET here; it still asks for a reason if one is needed.
        return null;
      }
    },
  });
}
