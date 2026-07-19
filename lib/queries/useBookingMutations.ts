import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingDetail, BookingStatus } from '@/types/booking-detail';
import type { BookingsListResponse } from '@/types/booking-list';

function invalidateBookingCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  accessToken: string | null,
  bookingId: string,
) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.bookings.detail(accessToken, bookingId),
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all() });
  // Keep the calendar grid in sync after status/reschedule changes.
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
  // A booking can be surfaced via the schedule feed (class/event/resource rosters)
  // or originate from a waitlist offer — refresh those so a status change made from
  // the detail sheet doesn't leave a stale roster/waitlist row during a polling gap.
  void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all() });
}

type StatusPatchContext = { previousBookings?: [QueryKey, unknown][] };

/**
 * Optimistically flip a booking's status everywhere it's cached — the detail
 * (sheet/pill) AND every bookings list/range query (the Bookings tab + day-list
 * rows) — so a swipe/confirm reflects instantly instead of waiting for the
 * onSettled refetch. Snapshots all touched bookings queries for rollback.
 */
async function optimisticStatusPatch(
  queryClient: ReturnType<typeof useQueryClient>,
  accessToken: string | null,
  bookingId: string,
  status: BookingStatus,
): Promise<StatusPatchContext> {
  if (!accessToken) return {};
  // Cancel only THIS booking's in-flight detail fetch so a late response can't
  // clobber the optimistic status. We deliberately do NOT cancel the broader
  // list/range queries — that would abort unrelated in-flight refetches; the
  // onSettled invalidate reconciles any list still loading.
  await queryClient.cancelQueries({
    queryKey: queryKeys.bookings.detail(accessToken, bookingId),
  });
  const previousBookings = queryClient.getQueriesData({ queryKey: queryKeys.bookings.all() });
  // Detail (single enriched object).
  const detailKey = queryKeys.bookings.detail(accessToken, bookingId);
  const previousDetail = queryClient.getQueryData<BookingDetail>(detailKey);
  if (previousDetail) {
    queryClient.setQueryData<BookingDetail>(detailKey, { ...previousDetail, status });
  }
  // List + range responses ({ bookings: BookingListRow[] }). The same filter also
  // matches the detail/summary queries, whose data has no `bookings` array — the
  // shape guard below skips them.
  queryClient.setQueriesData<BookingsListResponse>(
    { queryKey: queryKeys.bookings.all() },
    (old) => {
      if (!old || !Array.isArray(old.bookings)) return old;
      let changed = false;
      const bookings = old.bookings.map((row) => {
        if (row.id === bookingId && row.status !== status) {
          changed = true;
          return { ...row, status };
        }
        return row;
      });
      return changed ? { ...old, bookings } : old;
    },
  );
  return { previousBookings };
}

/** Restore every booking query snapshotted by optimisticStatusPatch (rollback on error). */
function rollbackStatusPatch(
  queryClient: ReturnType<typeof useQueryClient>,
  context: StatusPatchContext | undefined,
) {
  context?.previousBookings?.forEach(([key, data]) => {
    queryClient.setQueryData(key, data);
  });
}

function rollbackDetail(
  queryClient: ReturnType<typeof useQueryClient>,
  accessToken: string | null,
  bookingId: string,
  context: { previous?: BookingDetail } | undefined,
) {
  if (accessToken && context?.previous) {
    queryClient.setQueryData(queryKeys.bookings.detail(accessToken, bookingId), context.previous);
  }
}

/**
 * Seed the PATCH response into the cached detail. The bookings/[id] route returns
 * a bare booking row (no nested guest/events/communications/addons), so we MERGE
 * it onto the existing enriched detail instead of replacing — otherwise the sheet
 * flashes an empty guest header / dropped timeline until the onSettled refetch
 * lands. Keys absent from the bare row (the nested objects) are preserved.
 */
function seedDetailFromRow(
  queryClient: ReturnType<typeof useQueryClient>,
  accessToken: string | null,
  bookingId: string,
  data: BookingDetail,
) {
  if (!accessToken) return;
  queryClient.setQueryData<BookingDetail>(
    queryKeys.bookings.detail(accessToken, bookingId),
    (prev) => (prev ? { ...prev, ...data } : data),
  );
}

/**
 * PATCH /api/venue/bookings/[id] — update booking status (Confirm, Seated, etc.).
 * Optimistically updates the cached detail so the status pill + action toolbar
 * flip immediately, then reconciles with the server response.
 */
export function useUpdateBookingStatus(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (status: BookingStatus): Promise<BookingDetail> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<BookingDetail>(`/api/venue/bookings/${bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    onMutate: (status) => optimisticStatusPatch(queryClient, accessToken, bookingId, status),
    onError: (_error, _status, context) => rollbackStatusPatch(queryClient, context),
    onSuccess: (data) => seedDetailFromRow(queryClient, accessToken, bookingId, data),
    onSettled: () => {
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

/**
 * Cancel a booking via PATCH { status: 'Cancelled' }.
 * (DELETE on this route permanently removes an already-cancelled booking — not used for cancel.)
 */
export function useCancelBooking(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<BookingDetail> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<BookingDetail>(`/api/venue/bookings/${bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ status: 'Cancelled' }),
      });
    },
    onMutate: () => optimisticStatusPatch(queryClient, accessToken, bookingId, 'Cancelled'),
    onError: (_error, _vars, context) => rollbackStatusPatch(queryClient, context),
    onSuccess: (data) => seedDetailFromRow(queryClient, accessToken, bookingId, data),
    onSettled: () => {
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

/**
 * PATCH /api/venue/bookings/[id] — move a booking to a new date/time (reschedule),
 * optionally resizing it (duration_minutes recomputes booking_end_time server-side).
 * The backend validates availability and returns an error on conflict.
 */
export function useRescheduleBooking(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      date: string;
      time: string;
      durationMinutes?: number;
      /** Admin acknowledgement of an edit-time compliance block (409 → override). */
      overrideCompliance?: boolean;
    }): Promise<BookingDetail> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<BookingDetail>(`/api/venue/bookings/${bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({
          booking_date: input.date,
          booking_time: input.time,
          // Staff picked this time deliberately via the stepper sheet, so allow
          // out-of-hours moves (otherwise the server 409s with no actionable
          // reason). Overlaps are left to 409 here so an accidental double-book on
          // a busy practitioner still surfaces "slot taken".
          allow_outside_hours: true,
          ...(input.durationMinutes !== undefined
            ? { duration_minutes: input.durationMinutes }
            : {}),
          ...(input.overrideCompliance ? { override_compliance: true } : {}),
        }),
      });
    },
    onSuccess: (data) => {
      seedDetailFromRow(queryClient, accessToken, bookingId, data);
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

/**
 * PATCH /api/venue/bookings/[id] — reschedule (and optionally reassign the
 * practitioner) where the booking id is part of the mutation input. Used by
 * drag-to-reschedule on the calendar grid AND by the multi-calendar "move to
 * practitioner" chooser, where the target booking changes per action (a
 * fixed-id hook would close over a stale id).
 *
 * `practitionerId` reassigns the booking to a different calendar/practitioner.
 * The web PATCH route accepts `practitioner_id` standalone: `booking_date` /
 * `booking_time` fall back to the booking's current values server-side when a
 * reassign omits them, and the server routes the id to `calendar_id` or
 * `practitioner_id` based on the booking's anchor — so the app just sends the
 * column id. The server re-validates the slot on the TARGET practitioner and
 * 409s on a hard conflict, which the caller surfaces; the grid is only mutated
 * via the success invalidation, so a failed move leaves it untouched.
 */
export function useRescheduleBookingById() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      bookingId: string;
      date: string;
      time: string;
      /** New end "HH:mm:ss" — pins the validated span to the booking's REAL bar. */
      endTime?: string;
      durationMinutes?: number;
      /** Defer the server's guest "booking changed" email so the app can prompt. */
      deferGuestNotification?: boolean;
      /** New practitioner/calendar id — reassigns the booking when set. */
      practitionerId?: string;
      /** Admin acknowledgement of an edit-time compliance block (409 → override). */
      overrideCompliance?: boolean;
    }): Promise<BookingDetail> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<BookingDetail>(`/api/venue/bookings/${input.bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({
          booking_date: input.date,
          booking_time: input.time,
          // Out-of-hours is an explicit staff choice in both paths, so honour it.
          allow_outside_hours: true,
          // Manual overlap is only auto-allowed on the DRAG path, which already
          // refuses hard overlaps client-side before committing. A reassign
          // (practitionerId set) has NO pre-flight conflict check, so we must let
          // the server 409 on a clash — otherwise moving onto an occupied slot
          // would silently double-book and the "slot may be taken" error wouldn't fire.
          allow_manual_overlap: input.practitionerId === undefined,
          // Send the booking's real end so the server validates the TRUE span.
          // Without it the server recomputes the end from the catalogue-default
          // duration (wider than the bar), which false-triggers a "Blocked time"
          // 409 on a move that's visually clear of a calendar block.
          ...(input.endTime
            ? { booking_end_time: input.endTime }
            : input.durationMinutes !== undefined
              ? { duration_minutes: input.durationMinutes }
              : {}),
          // The app surfaces a Notify/Skip prompt after the move, so stop the
          // server emailing the guest automatically on every drag.
          ...(input.deferGuestNotification
            ? { defer_modification_guest_notification: true }
            : {}),
          ...(input.practitionerId !== undefined
            ? { practitioner_id: input.practitionerId }
            : {}),
          ...(input.overrideCompliance ? { override_compliance: true } : {}),
        }),
      });
    },
    onSuccess: (data, input) => {
      seedDetailFromRow(queryClient, accessToken, input.bookingId, data);
      invalidateBookingCaches(queryClient, accessToken, input.bookingId);
    },
  });
}

/**
 * Full appointment modification — change service, staff, slot and duration in
 * one PATCH (web StaffAppointmentModifyForm parity). Exactly one of
 * `appointment_service_id` / `service_item_id` must be set, matching which
 * anchor the booking row uses.
 */
export interface ModifyAppointmentInput {
  booking_date: string;
  /** HH:mm:ss */
  booking_time: string;
  practitioner_id: string;
  appointment_service_id?: string;
  service_item_id?: string;
  duration_minutes: number;
  service_variant_id?: string | null;
  /**
   * Full desired add-on set (REPLACE semantics — send every add-on the booking
   * should end up with, not a delta). Matches the create-booking payload key
   * (`addons: [{ addon_id }]`).
   *
   * The web PATCH /api/venue/bookings/[id] route consumes `addons` on appointment
   * modify: it validates them against the service's groups, rewrites the
   * booking_addons snapshots, and refreshes addons_total_*. The client also folds
   * add-on minutes into `duration_minutes` so the wall-clock end time is correct.
   */
  addons?: { addon_id: string }[];
  /** Admin acknowledgement of an edit-time compliance block (409 → override). */
  override_compliance?: boolean;
}

/** PATCH /api/venue/bookings/[id] — full appointment modify. */
export function useModifyAppointment(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ModifyAppointmentInput): Promise<BookingDetail> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<BookingDetail>(`/api/venue/bookings/${bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: (data) => {
      seedDetailFromRow(queryClient, accessToken, bookingId, data);
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

export interface ValidateAppointmentModificationInput {
  booking_date: string;
  /** HH:mm */
  booking_time: string;
  practitioner_id: string;
  appointment_service_id?: string | null;
  service_item_id?: string | null;
  duration_minutes?: number | null;
  service_variant_id?: string | null;
}

export type ValidateAppointmentModificationResult =
  | { ok: true }
  | { ok: false; error?: string };

/**
 * POST /api/venue/bookings/[id]/validate-appointment-modification — dry-run
 * slot check for the modify sheet (same engine as the PATCH validation).
 */
export function useValidateAppointmentModification(bookingId: string) {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (
      input: ValidateAppointmentModificationInput,
    ): Promise<ValidateAppointmentModificationResult> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ValidateAppointmentModificationResult>(
        `/api/venue/bookings/${bookingId}/validate-appointment-modification`,
        { accessToken, method: 'POST', body: JSON.stringify(input) },
      );
    },
  });
}

export type GuestMessageChannel = 'email' | 'sms' | 'both';

export interface SendBookingMessageResult {
  success: boolean;
  errors?: string[];
}

/**
 * POST /api/venue/bookings/[id]/message — send a custom message to the guest.
 * Invalidates the detail so the new communication shows on the timeline.
 */
export function useSendBookingMessage(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      message: string;
      channel: GuestMessageChannel;
    }): Promise<SendBookingMessageResult> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<SendBookingMessageResult>(`/api/venue/bookings/${bookingId}/message`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

/**
 * POST /api/venue/bookings/[id]/resend-confirmation — re-send the booking
 * confirmation email/SMS (requires the guest to have an email on file).
 */
export function useResendConfirmation(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ success: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ success: boolean }>(
        `/api/venue/bookings/${bookingId}/resend-confirmation`,
        { accessToken, method: 'POST' },
      );
    },
    onSuccess: () => {
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

/**
 * POST /api/venue/bookings/[id]/guest-modification-notify — send the DEFERRED
 * "your booking changed" notification to the guest. Used after a drag-reschedule
 * (which defers the auto-notification) when the user taps "Notify".
 */
export function useNotifyBookingModification() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { bookingId: string }): Promise<{ ok: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ ok: boolean }>(
        `/api/venue/bookings/${input.bookingId}/guest-modification-notify`,
        { accessToken, method: 'POST' },
      );
    },
    onSuccess: (_data, input) => {
      invalidateBookingCaches(queryClient, accessToken, input.bookingId);
    },
  });
}

export type DepositAction =
  | 'send_payment_link'
  | 'waive'
  | 'record_cash'
  | 'refund'
  // Card-hold deposits (§9.2): admin-only charge of the saved card's no-show
  // fee (`amount_pence` clamps to the consented fee), and release of a hold
  // kept by a late cancellation. On hold bookings the server also swaps the
  // comms for `send_payment_link` (card request) and releases on `waive`.
  | 'charge_no_show_fee'
  | 'release_hold';

/**
 * POST /api/venue/bookings/[id]/deposit — deposit actions: send a payment link,
 * waive, record a cash payment, refund, or the card-hold actions (charge the
 * no-show fee / release a kept hold). Invalidates the booking on success.
 */
export function useBookingDeposit(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      action: DepositAction;
      amount_pence?: number;
    }): Promise<{ success: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ success: boolean }>(`/api/venue/bookings/${bookingId}/deposit`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

/**
 * PATCH /api/venue/bookings/[id] — staff attendance confirmation and
 * guest-arrived toggles (mirrors the web's attendance pills).
 */
export function useSetBookingAttendance(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      staff_attendance_confirmed?: boolean;
      client_arrived?: boolean;
    }): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(`/api/venue/bookings/${bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    // Optimistically flip the arrived / staff-confirmed timestamps so the detail
    // pills toggle instantly; the onSettled refetch replaces the sentinel time
    // with the server's real one.
    onMutate: async (input) => {
      if (!accessToken) return {};
      const key = queryKeys.bookings.detail(accessToken, bookingId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BookingDetail>(key);
      if (previous) {
        const now = new Date().toISOString();
        queryClient.setQueryData<BookingDetail>(key, {
          ...previous,
          ...(input.client_arrived !== undefined
            ? { client_arrived_at: input.client_arrived ? now : null }
            : {}),
          ...(input.staff_attendance_confirmed !== undefined
            ? { staff_attendance_confirmed_at: input.staff_attendance_confirmed ? now : null }
            : {}),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) =>
      rollbackDetail(queryClient, accessToken, bookingId, context),
    onSettled: () => {
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

/** Editable guest-contact + notes fields on PATCH /api/venue/bookings/[id]. */
export interface UpdateBookingDetailsInput {
  guest_first_name?: string | null;
  guest_last_name?: string | null;
  guest_phone?: string | null;
  guest_email?: string | null;
  special_requests?: string | null;
  dietary_notes?: string | null;
  internal_notes?: string | null;
  occasion?: string | null;
}

/**
 * PATCH /api/venue/bookings/[id] — edit guest contact details and booking notes.
 * The route returns the raw booking row (not the enriched detail), so we
 * invalidate to refetch the full detail rather than seeding the cache.
 */
export function useUpdateBookingDetails(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateBookingDetailsInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(`/api/venue/bookings/${bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

/**
 * DELETE /api/venue/bookings/[id] — permanently remove a cancelled booking.
 */
export function useDeleteBooking(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ success: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ success: boolean }>(`/api/venue/bookings/${bookingId}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      if (accessToken) {
        queryClient.removeQueries({
          queryKey: queryKeys.bookings.detail(accessToken, bookingId),
        });
      }
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}
