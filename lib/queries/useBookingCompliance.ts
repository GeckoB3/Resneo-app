import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingComplianceResponse } from '@/types/booking-compliance';

/**
 * GET /api/venue/bookings/[id]/compliance — requirement states for this
 * booking's service + all of the guest's compliance records.
 * The route is plan-gated: 402/403 means compliance isn't on the venue's plan
 * — treat that as "not applicable" rather than an error.
 */
export function useBookingCompliance(bookingId: string | null, enabled = true) {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: queryKeys.compliance.booking(accessToken, bookingId),
    enabled: enabled && isBackendConfigured() && accessToken !== null && !!bookingId,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.status === 402 || error.status === 403)) {
        return false;
      }
      return failureCount < 2;
    },
    queryFn: async (): Promise<BookingComplianceResponse | null> => {
      if (!accessToken || !bookingId) {
        throw new Error('Missing compliance parameters');
      }
      try {
        return await apiFetch<BookingComplianceResponse>(
          `/api/venue/bookings/${bookingId}/compliance`,
          { accessToken },
        );
      } catch (error) {
        if (error instanceof ApiError && (error.status === 402 || error.status === 403)) {
          return null;
        }
        throw error;
      }
    },
  });
}

export type ComplianceSendVia = 'email' | 'sms' | 'manual_copy';

export interface SendComplianceFormLinkInput {
  guest_id: string;
  compliance_type_id: string;
  booking_id?: string;
  send_via: ComplianceSendVia;
}

export interface SendComplianceFormLinkResult {
  link?: { id: string; code: string };
  public_url: string;
  reused: boolean;
  dispatched: boolean;
}

/**
 * POST /api/venue/compliance/form-links — issue (or reuse) a guest form link
 * and optionally dispatch it by email/SMS.
 */
export function useSendComplianceFormLink() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: SendComplianceFormLinkInput,
    ): Promise<SendComplianceFormLinkResult> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<SendComplianceFormLinkResult>('/api/venue/compliance/form-links', {
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
