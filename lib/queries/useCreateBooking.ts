import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { experienceEventKeys } from '@/lib/queries/useExperienceEvents';
import { resourceQueryKeys } from '@/lib/queries/useResources';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingTicketLine } from '@/types/booking-offerings';

/**
 * POST /api/venue/bookings — staff walk-in / phone create body.
 *
 * One endpoint serves every booking model; the server infers the model from
 * which anchor ids are present (appointment vs class vs event vs resource).
 */
export interface CreateBookingPayload {
  booking_date: string;
  booking_time: string;
  party_size: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  practitioner_id?: string;
  appointment_service_id?: string;
  service_variant_id?: string;
  addons?: { addon_id: string }[];
  /** Class booking — the scheduled session/occurrence id. */
  class_instance_id?: string;
  /** Event booking — the occurrence id (+ ticket_lines). */
  experience_event_id?: string;
  /** Event booking — one line per ticket type (party_size must equal the sum). */
  ticket_lines?: BookingTicketLine[];
  /** Resource booking — the resource id (+ booking_end_time). */
  resource_id?: string;
  /** Resource booking — end time HH:mm (start is booking_time). */
  booking_end_time?: string;
  source?: 'phone' | 'walk-in';
  owner_venue_id?: string;
  /** Staff override for this booking's duration (minutes). */
  duration_minutes?: number;
  /** Dietary notes from the guest (max 500 chars). */
  dietary_notes?: string;
  /** Occasion (max 200 chars). */
  occasion?: string;
  /** Special requests (max 500 chars). */
  special_requests?: string;
  /** Force Stripe deposit link generation even for phone bookings. */
  require_deposit?: boolean;
  /**
   * Staff card-hold toggle (spec §7.6/D6): for a card-hold entity, `false`
   * waives the hold (booking created like a no-deposit booking). Omitted or
   * `true` keeps the default-on hold: booking held Pending + card request link
   * sent. Walk-ins included (unlike `require_deposit`).
   */
  require_card_hold?: boolean;
  /**
   * Flag the booking as belonging to an existing/known contact. The web sends
   * this when staff pick a known contact (or rebook a guest) so the backend
   * links the booking to the existing client rather than minting a new one.
   */
  returning_guest?: boolean;
  /** Admin override for compliance pre-check failures (409 COMPLIANCE_REQUIREMENT_UNMET). */
  override_compliance?: boolean;
}

/**
 * A non-blocking (warn_staff / warn_client) compliance requirement that was unmet
 * when the booking was created. The server returns these in the 201 so staff can
 * be nudged to collect or send the form before the appointment (audit M2).
 */
export interface ComplianceBookingWarning {
  compliance_type_id: string;
  compliance_type_name: string;
  enforcement: string;
  state: string;
}

export interface CreateBookingResponse {
  booking_id: string;
  payment_url?: string;
  message?: string;
  requires_deposit?: boolean;
  deposit_amount_pence?: number;
  /** True when the booking was created with a card hold requested (link sent). */
  card_hold_requested?: boolean;
  cancellation_notice_hours?: number;
  /** Unmet non-blocking compliance requirements, surfaced on the confirmation. */
  compliance_warnings?: ComplianceBookingWarning[];
}

/**
 * Creates a staff booking via POST /api/venue/bookings.
 * Invalidates dashboard and bookings caches on success.
 */
export function useCreateBooking() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateBookingPayload): Promise<CreateBookingResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<CreateBookingResponse>('/api/venue/bookings', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
      // A new booking must also refresh the calendar grid (day/week/month);
      // it keys off calendar.* and otherwise shows stale until the 60s poll.
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
      // Class/event/resource bookings surface on their own screens (and the
      // merged schedule feed), which sit under separate cache roots — refresh
      // them too so a new class/event/resource booking shows immediately.
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all() });
      void queryClient.invalidateQueries({ queryKey: experienceEventKeys.all });
      void queryClient.invalidateQueries({ queryKey: resourceQueryKeys.all() });
      // A new booking can fulfil a waitlist entry and updates the guest's visit
      // history / returning-guest badges — refresh both (cf. invalidateBookingCaches).
      void queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all() });
    },
  });
}
