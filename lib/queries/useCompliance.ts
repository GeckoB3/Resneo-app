import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import type { FileResponse } from '@/lib/compliance/form-schema';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  ComplianceDashboardData,
  ComplianceFormLinksResponse,
  ComplianceRecordDetailResponse,
  ComplianceTypeWithVersion,
  GuestComplianceResponse,
} from '@/types/compliance';

/** GET /api/venue/compliance/dashboard — expiring / missing / awaiting (plan-gated). */
export function useComplianceDashboard() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.compliance.dashboard(accessToken),
    enabled,
    retry: false, // a 403 means the plan doesn't include compliance — don't hammer it
    queryFn: async (): Promise<ComplianceDashboardData> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ComplianceDashboardData>('/api/venue/compliance/dashboard', { accessToken });
    },
  });
}

/** GET /api/venue/compliance/form-links — outstanding & completed form links. */
export function useComplianceFormLinks() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.compliance.formLinks(accessToken),
    enabled,
    retry: false,
    queryFn: async (): Promise<ComplianceFormLinksResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ComplianceFormLinksResponse>('/api/venue/compliance/form-links', {
        accessToken,
      });
    },
  });
}

/** POST /api/venue/compliance/form-links/[id]/resend — re-send a pending form. */
export function useResendFormLink() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      send_via: 'email' | 'sms';
    }): Promise<{ dispatched: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ dispatched: boolean }>(
        `/api/venue/compliance/form-links/${input.id}/resend`,
        { accessToken, method: 'POST', body: JSON.stringify({ send_via: input.send_via }) },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

/** POST /api/venue/compliance/form-links/[id]/revoke — revoke an unconsumed link. */
export function useRevokeFormLink() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (linkId: string): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(`/api/venue/compliance/form-links/${linkId}/revoke`, {
        accessToken,
        method: 'POST',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

/** GET /api/venue/compliance/types/[id] — type detail + current form schema. */
export function useComplianceType(typeId: string | null) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && !!typeId;

  return useQuery({
    queryKey: [...queryKeys.compliance.all(), 'type', keyScope(accessToken), typeId ?? null] as const,
    enabled,
    retry: false,
    queryFn: async (): Promise<ComplianceTypeWithVersion> => {
      if (!accessToken || !typeId) {
        throw new Error('Missing parameters');
      }
      return apiFetch<ComplianceTypeWithVersion>(`/api/venue/compliance/types/${typeId}`, {
        accessToken,
      });
    },
  });
}

/** GET /api/venue/compliance/records/[id] — record detail with form responses + version schema. */
export function useComplianceRecord(recordId: string | null) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && !!recordId;

  return useQuery({
    queryKey: [...queryKeys.compliance.all(), 'record', keyScope(accessToken), recordId ?? null] as const,
    enabled,
    retry: false,
    queryFn: async (): Promise<ComplianceRecordDetailResponse> => {
      if (!accessToken || !recordId) {
        throw new Error('Missing parameters');
      }
      return apiFetch<ComplianceRecordDetailResponse>(
        `/api/venue/compliance/records/${recordId}`,
        { accessToken },
      );
    },
  });
}

/** POST /api/venue/compliance/records/[id]/void — void a record with a reason. */
export function useVoidComplianceRecord() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { recordId: string; reason: string }): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(`/api/venue/compliance/records/${input.recordId}/void`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ reason: input.reason }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

/**
 * PATCH /api/venue/compliance/records/[id] — record a staff pass/fail decision on
 * an undecided pass_fail record (and/or edit notes). The server 400s a `result` on
 * a non-pass_fail type; surface the error to the caller.
 */
export function useUpdateComplianceRecord() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      recordId: string;
      result?: 'pass' | 'fail' | 'inconclusive';
      notes?: string | null;
    }): Promise<{ record: { id: string } }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const { recordId, ...patch } = input;
      return apiFetch<{ record: { id: string } }>(
        `/api/venue/compliance/records/${recordId}`,
        { accessToken, method: 'PATCH', body: JSON.stringify(patch) },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

/**
 * capture_channel values the backend accepts (mirrors COMPLIANCE_CAPTURE_CHANNELS
 * in the web app). The app sends `staff_mobile` for staff entry and
 * `client_walkin` when handing the device to the client.
 */
export type ComplianceCaptureChannel =
  | 'staff_web'
  | 'staff_mobile'
  | 'client_email'
  | 'client_sms'
  | 'client_walkin'
  | 'client_booking'
  | 'import';

/** POST /api/venue/compliance/records — capture a compliance record in-venue. */
export function useCaptureComplianceRecord() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      guest_id: string;
      compliance_type_id: string;
      booking_id?: string | null;
      capture_channel: ComplianceCaptureChannel;
      responses: Record<string, unknown>;
      notes?: string | null;
    }): Promise<{ record: { id: string } }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ record: { id: string } }>('/api/venue/compliance/records', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

/**
 * POST /api/venue/compliance/records/upload — staff upload of a `file`-field
 * document while capturing a record in venue (multipart). Returns the FileResponse
 * the capture sheet stores as that field's answer. apiFetch lets the platform set
 * the multipart boundary for a FormData body.
 */
export function useUploadComplianceRecordFile() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (file: {
      uri: string;
      name: string;
      mimeType: string;
    }): Promise<FileResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const form = new FormData();
      // React Native FormData file part ({ uri, name, type }).
      form.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType,
      } as unknown as Blob);
      return apiFetch<FileResponse>('/api/venue/compliance/records/upload', {
        accessToken,
        method: 'POST',
        body: form,
      });
    },
  });
}

/**
 * GET /api/venue/compliance/records/[id]/file?field=… — a short-lived (120s) signed
 * URL for a captured signature or uploaded file. Fetched on demand (per tap) because
 * the URL expires quickly and the compliance-files bucket is private.
 */
export function useComplianceRecordFile() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (input: {
      recordId: string;
      fieldId: string;
    }): Promise<{ url: string; expires_in: number; file_name: string | null }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ url: string; expires_in: number; file_name: string | null }>(
        `/api/venue/compliance/records/${input.recordId}/file?field=${encodeURIComponent(input.fieldId)}`,
        { accessToken },
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Booking-flags hook
// ---------------------------------------------------------------------------

export interface ComplianceBookingFlag {
  /** `unmet` = at least one required record is missing/expired; `satisfied` = all on file. */
  state: 'satisfied' | 'unmet';
  /** True when an unmet requirement blocks booking (block_online / block_all). */
  blocking: boolean;
  /** Type names: the unmet ones when `unmet`, otherwise all required types (for the label/tooltip). */
  labels: string[];
}

export interface ComplianceBookingFlagsResponse {
  flags: Record<string, ComplianceBookingFlag>;
}

/**
 * POST /api/venue/compliance/booking-flags — per-booking compliance status for
 * the visible calendar / list. Returns a map of bookingId → flag. Bookings
 * with no requirement are omitted from the response.
 *
 * Pass an empty array to skip the request entirely (returns { flags: {} }).
 */
export function useComplianceBookingFlags(bookingIds: string[]) {
  const accessToken = useAccessToken();
  const sortedKey = [...bookingIds].sort().join(',');
  const enabled = isBackendConfigured() && accessToken !== null && bookingIds.length > 0;

  return useQuery({
    queryKey: [
      ...queryKeys.compliance.all(),
      'bookingFlags',
      keyScope(accessToken),
      sortedKey,
    ] as const,
    enabled,
    retry: false, // 403 = no plan; don't hammer
    staleTime: 60_000, // 1 min — flags are advisory, not blocking
    queryFn: async (): Promise<ComplianceBookingFlagsResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<ComplianceBookingFlagsResponse>(
        '/api/venue/compliance/booking-flags',
        {
          accessToken,
          method: 'POST',
          body: JSON.stringify({ booking_ids: bookingIds }),
        },
      );
    },
  });
}

/** GET /api/venue/guests/[guestId]/compliance — full compliance history for a guest. */
export function useGuestCompliance(guestId: string | null) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && !!guestId;

  return useQuery({
    queryKey: [...queryKeys.compliance.all(), 'guest', keyScope(accessToken), guestId ?? null] as const,
    enabled,
    retry: false,
    queryFn: async (): Promise<GuestComplianceResponse | null> => {
      if (!accessToken || !guestId) {
        throw new Error('Missing parameters');
      }
      return apiFetch<GuestComplianceResponse>(`/api/venue/guests/${guestId}/compliance`, {
        accessToken,
      });
    },
  });
}
