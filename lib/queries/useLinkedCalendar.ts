/**
 * Linked calendar + cross-venue booking hooks (Phase 4, §2.5).
 *
 * Reads/writes go through the dedicated `/api/venue/linked-calendar/**` routes
 * so the server applies the §18 calendar-scope, PII redaction (time_only vs
 * full_details), and writes the cross-venue audit + owner notification. The app
 * never assembles a cross-venue read or write client-side (§2.8).
 *
 * Mutations are NOT optimistic — a cross-venue write is server-authoritative
 * (RPC-backed) and the owner venue must agree, so we show a spinner and
 * invalidate the calendar range on settle (matches the web `await load()`).
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { getApiUrl, isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  LinkedBookingChangePayload,
  LinkedBookingCreatePayload,
  LinkedCalendarResponse,
  LinkedGuestsResponse,
} from '@/types/linked-venues';

/** Shape of `…/venue-profile` — booking model + currency for a linked venue. */
export interface LinkedVenueProfileResponse {
  venue_name: string;
  venue: Record<string, unknown>;
  booking_model: string | null;
  enabled_models: string[];
  currency: string;
}

/**
 * GET /api/venue/linked-calendar — every linked venue's calendar for a date (or
 * a `from`/`to` range), already redacted to the caller's grant. Returns the
 * `LinkedVenueCalendar[]`. Refetches every 60s as the realtime fallback (§13/8).
 */
export function useLinkedCalendar(params: { from: string; to: string }) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;
  const { from, to } = params;

  return useQuery({
    queryKey: queryKeys.linkedCalendar.range(accessToken, from, to),
    enabled,
    // Keep the prior day/range on screen while the next loads — stepping the
    // date (or switching day↔week) dims rather than flashing a full loader,
    // matching the primary calendar grid (useCalendarGrid).
    placeholderData: keepPreviousData,
    // Cross-venue write activity arrives via account_link_notifications
    // realtime; this poll is the belt-and-braces fallback (§9 realtime/poll).
    refetchInterval: 60_000,
    // Don't keep polling while backgrounded — the realtime channel resubscribes
    // on resume and the next foreground refetch catches up (matches useNotifications).
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<LinkedCalendarResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      const qs = new URLSearchParams({ from, to }).toString();
      return apiFetch<LinkedCalendarResponse>(`/api/venue/linked-calendar?${qs}`, {
        accessToken,
      });
    },
  });
}

/**
 * POST /api/venue/linked-calendar/booking — create a booking in a linked venue
 * (RPC `linked_apply_booking_insert`). Available only when the grant is
 * `create_edit_cancel`; the guest comes from the linked venue's own clients.
 */
export function useCreateLinkedBooking() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: LinkedBookingCreatePayload,
    ): Promise<{ booking: unknown }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ booking: unknown }>('/api/venue/linked-calendar/booking', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.linkedCalendar.all() });
    },
  });
}

/**
 * PATCH /api/venue/linked-calendar/booking — edit or cancel a linked-venue
 * booking (RPC `linked_apply_booking_update`). Cancelling is `status:'Cancelled'`
 * and is only offered when the grant is `create_edit_cancel` (the caller gates).
 */
export function useUpdateLinkedBooking() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: LinkedBookingChangePayload,
    ): Promise<{ booking: unknown }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ booking: unknown }>('/api/venue/linked-calendar/booking', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.linkedCalendar.all() });
    },
  });
}

/**
 * GET /api/venue/linked-calendar/guests — search a linked venue's own clients
 * for a cross-venue booking. Debounce ≥250ms in the caller (we gate on
 * `enabled` so an empty/too-short query doesn't fire). Needs
 * `create_edit_cancel`+`pii` server-side.
 */
export function useLinkedGuests(venueId: string | null, q: string) {
  const accessToken = useAccessToken();
  const trimmed = q.trim();
  const enabled = isBackendConfigured() && accessToken !== null && venueId !== null;

  return useQuery({
    queryKey: queryKeys.linkedCalendar.guests(accessToken, venueId, trimmed),
    enabled,
    // The search box always shows the most recent results; keep the previous
    // page visible while the next query loads to avoid a flicker to empty.
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<LinkedGuestsResponse> => {
      if (!accessToken || !venueId) throw new Error('Missing access token');
      const qs = new URLSearchParams({ venueId, q: trimmed }).toString();
      return apiFetch<LinkedGuestsResponse>(`/api/venue/linked-calendar/guests?${qs}`, {
        accessToken,
      });
    },
  });
}

/**
 * GET /api/venue/linked-calendar/venue-profile — the linked venue's booking
 * model + currency, used to frame the create form. Needs `create_edit_cancel`.
 */
export function useLinkedVenueProfile(venueId: string | null) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && venueId !== null;

  return useQuery({
    queryKey: queryKeys.linkedCalendar.venueProfile(accessToken, venueId),
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LinkedVenueProfileResponse> => {
      if (!accessToken || !venueId) throw new Error('Missing access token');
      const qs = new URLSearchParams({ venueId }).toString();
      return apiFetch<LinkedVenueProfileResponse>(
        `/api/venue/linked-calendar/venue-profile?${qs}`,
        { accessToken },
      );
    },
  });
}

/**
 * Best-effort audit ping that a linked booking's detail was opened (§4.2
 * `viewed_booking`). The server debounces to a 5-minute window, so detail sheets
 * fire this freely on open. Failures are swallowed — an audit ping must never
 * disrupt the detail the user already opened. Mirrors the web
 * `pingLinkedBookingView`.
 */
export function pingLinkedBookingView(bookingId: string, accessToken: string | null): void {
  if (!isBackendConfigured() || !accessToken) return;
  void fetch(`${getApiUrl()}/api/venue/linked-calendar/booking/view`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ bookingId }),
  }).catch(() => {});
}
