import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
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

/** POST /api/venue/compliance/records — capture a compliance record in-venue. */
export function useCaptureComplianceRecord() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      guest_id: string;
      compliance_type_id: string;
      booking_id?: string | null;
      capture_channel: 'staff_web' | 'client_walkin';
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

// ---------------------------------------------------------------------------
// Booking-flags hook
// ---------------------------------------------------------------------------

export interface ComplianceBookingFlag {
  state: 'missing' | 'expired' | 'expiring_soon' | 'satisfied';
  blocking: boolean;
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
