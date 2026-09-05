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

export type LinkedBookingComplianceResult =
  | { kind: 'data'; data: BookingComplianceResponse }
  /** A refusal that is an answer, not a fault: shown as a plain note. */
  | { kind: 'note'; text: string };

const LINKED_NOT_ENABLED_NOTE =
  'That venue does not use compliance records, so there is nothing to show here.';

/**
 * The compliance state of a LINKED venue's booking, read through the link (web
 * 2026-09-05). The route looks the booking up owner-first and allows the read
 * only when the link shares full details and personal data, gated on the
 * OWNER's plan and audited; the answer carries `linked: true`. Two refusals are
 * answers rather than faults and come back as notes instead of errors: the link
 * does not share compliance records (403 `linked_no_pii`, with the server's
 * sentence) and the owner venue does not use compliance records (403 "Feature
 * not available").
 */
export function useLinkedBookingCompliance(bookingId: string | null, enabled = true) {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: [...queryKeys.compliance.booking(accessToken, bookingId), 'linked'] as const,
    enabled: enabled && isBackendConfigured() && accessToken !== null && !!bookingId,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.status === 402 || error.status === 403)) {
        return false;
      }
      return failureCount < 2;
    },
    queryFn: async (): Promise<LinkedBookingComplianceResult> => {
      if (!accessToken || !bookingId) {
        throw new Error('Missing compliance parameters');
      }
      try {
        const data = await apiFetch<BookingComplianceResponse>(
          `/api/venue/bookings/${bookingId}/compliance`,
          { accessToken },
        );
        return { kind: 'data', data };
      } catch (error) {
        if (error instanceof ApiError && (error.status === 402 || error.status === 403)) {
          const body = error.body as { code?: string; error?: string } | undefined;
          if (body?.code === 'linked_no_pii' && typeof body.error === 'string') {
            return { kind: 'note', text: body.error };
          }
          return { kind: 'note', text: LINKED_NOT_ENABLED_NOTE };
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
  /**
   * Real delivery channel to request; OMIT to just issue the link and copy it (the
   * route always returns public_url, and resolves to manual_copy server-side when
   * the guest has no email/phone). `manual_copy` is server-internal only and must
   * never be sent as a caller input — the backend enum is email|sms.
   */
  send_via?: 'email' | 'sms';
}

export interface SendComplianceFormLinkResult {
  link?: { id: string; code: string };
  public_url: string;
  reused: boolean;
  dispatched: boolean;
  /** The channel the server actually sent by (SMS can fall back to email). */
  sent_via?: 'email' | 'sms' | null;
  /** True when the guest has no email/phone on file, so nothing was dispatched. */
  no_destination?: boolean;
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
