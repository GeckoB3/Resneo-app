import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { CustomerBooking } from '@/lib/queries/useCustomerHome';

/**
 * The caller's own bookings, and the actions on one.
 *
 * Everything here is scoped server-side from the session. There is no id to
 * pass identifying WHO is asking, and somebody else's booking id returns 404
 * rather than 403, so a guessed id teaches a stranger nothing.
 */

export interface CustomerBookingsResponse {
  bookings: CustomerBooking[];
}

export function useCustomerBookings() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.customer.bookings(accessToken),
    enabled,
    queryFn: async (): Promise<CustomerBookingsResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<CustomerBookingsResponse>('/api/v1/me/bookings', { accessToken });
    },
  });
}

/** Where it happens, already assembled in reading order by the server. */
export interface BookingLocation {
  type: 'venue' | 'client_address' | 'online';
  address: string | null;
  map_url: string | null;
}

/**
 * One booking in full: the shared DTO the web's own detail page renders.
 *
 * Only the fields this app shows are declared. A type that claims to describe
 * the whole payload has to be kept in step with it, and the parts it gets wrong
 * stay invisible until something reads them.
 */
export interface CustomerBookingDetail {
  booking_id: string;
  venue_id: string;
  venue_name: string | undefined;
  venue_phone: string | null;
  booking_date: string;
  booking_time: string;
  booking_end_time: string | null;
  party_size: number;
  status: string;
  booking_model: string;
  is_appointment: boolean;
  practitioner_id: string | null;
  practitioner_name: string | null;
  appointment_service_id: string | null;
  appointment_service_name: string | null;
  event_name: string | null;
  class_type_name: string | null;
  resource_name: string | null;
  deposit_paid: boolean;
  deposit_amount_pence: number | null;
  cancellation_deadline: string | null;
  refund_notice_hours: number;
  guest_attendance_confirmed_at: string | null;
  /**
   * Whether this is one session of a course bought together.
   *
   * The portal needs it to say what a change DOES: a course is many booking
   * rows sharing a group, and moving one moves that one. Somebody who reads
   * "change booking" as "move my course" and then finds five sessions still in
   * the old slot has been misled by the button.
   */
  part_of_course: boolean;
  location: BookingLocation;
  notes: { label: string; value: string }[];
  compliance_forms: { name: string; url: string }[];
  /** False when the forms lookup FAILED, so an empty list carries no meaning. */
  compliance_forms_checked?: boolean;
}

export function useCustomerBookingDetail(bookingId: string | null | undefined) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && Boolean(bookingId);

  return useQuery({
    queryKey: queryKeys.customer.booking(bookingId ?? null, accessToken),
    enabled,
    queryFn: async (): Promise<CustomerBookingDetail> => {
      if (!accessToken || !bookingId) throw new Error('Missing booking');
      return apiFetch<CustomerBookingDetail>(
        `/api/v1/me/bookings/${encodeURIComponent(bookingId)}`,
        { accessToken },
      );
    },
  });
}

/** Why a booking cannot be moved, in the server's own vocabulary. */
export type RescheduleBlockedReason = 'booking_status' | 'venue_disabled' | 'not_movable';

export interface RescheduleOptions {
  booking_id: string;
  booking_model: string;
  status: string;
  can_reschedule: boolean;
  blocked_reason: RescheduleBlockedReason | null;
  /** Customer-facing, and null when the booking CAN be moved. */
  message: string | null;
  /**
   * The body keys the move requires for this booking model.
   *
   * Returned rather than documented because the models take genuinely different
   * bodies, and a client that guesses gets a 400 it cannot explain to anybody.
   */
  required_fields: string[];
  cancellation_deadline: string | null;
  current: {
    booking_date: string;
    booking_time: string;
    party_size: number;
    practitioner_id: string | null;
    appointment_service_id: string | null;
  };
  venue: { id: string; timezone: string };
}

/**
 * Whether this booking can be moved, and what a move would need.
 *
 * Returns NO slots, deliberately: availability is a separate, public call. This
 * answers the question that decides whether showing a picker makes sense at all.
 */
export function useRescheduleOptions(bookingId: string | null | undefined, enabled = true) {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: queryKeys.customer.rescheduleOptions(bookingId ?? null, accessToken),
    enabled: isBackendConfigured() && accessToken !== null && Boolean(bookingId) && enabled,
    queryFn: async (): Promise<RescheduleOptions> => {
      if (!accessToken || !bookingId) throw new Error('Missing booking');
      return apiFetch<RescheduleOptions>(
        `/api/v1/me/bookings/${encodeURIComponent(bookingId)}/reschedule-options`,
        { accessToken },
      );
    },
  });
}

/**
 * Everything that changes a booking invalidates the same three things.
 *
 * The hub aggregates bookings, the list contains this one, and the detail is
 * this one. Missing any of them leaves a cancelled booking still showing as
 * "next" on the hub, which is the kind of stale screen people ring a venue
 * about.
 */
function useInvalidateBooking(bookingId: string | null | undefined) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.customer.all() });
    if (bookingId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.customer.booking(bookingId, undefined),
        exact: false,
      });
    }
  };
}

export function useCancelBooking(bookingId: string | null | undefined) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateBooking(bookingId);

  return useMutation({
    mutationFn: async () => {
      if (!accessToken || !bookingId) throw new Error('Missing booking');
      return apiFetch(`/api/v1/me/bookings/${encodeURIComponent(bookingId)}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSuccess: invalidate,
  });
}

/**
 * Confirm attendance: the action the "please confirm you are coming" email asks
 * for, available here so somebody who lost the email is not stuck.
 *
 * Idempotent server-side, which matters more on a button than on an emailed
 * link, because a button is easy to press twice.
 */
export function useConfirmAttendance(bookingId: string | null | undefined) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateBooking(bookingId);

  return useMutation({
    mutationFn: async () => {
      if (!accessToken || !bookingId) throw new Error('Missing booking');
      return apiFetch(`/api/v1/me/bookings/${encodeURIComponent(bookingId)}/confirm`, {
        accessToken,
        method: 'POST',
      });
    },
    onSuccess: invalidate,
  });
}

export interface RescheduleChanges {
  booking_date?: string;
  booking_time?: string;
  practitioner_id?: string;
  appointment_service_id?: string;
}

export function useRescheduleBooking(bookingId: string | null | undefined) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateBooking(bookingId);

  return useMutation({
    mutationFn: async (changes: RescheduleChanges) => {
      if (!accessToken || !bookingId) throw new Error('Missing booking');
      return apiFetch(`/api/v1/me/bookings/${encodeURIComponent(bookingId)}/reschedule`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify(changes),
      });
    },
    onSuccess: invalidate,
  });
}
