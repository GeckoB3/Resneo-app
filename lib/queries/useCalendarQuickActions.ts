/**
 * Calendar quick-action mutations — accept the bookingId as part of the
 * mutationFn input so a single hook instance can service any booking on
 * the calendar grid (unlike useUpdateBookingStatus which binds to a single id).
 *
 * These are deliberately plain PATCH senders: no `onMutate`, no invalidation. A
 * press on a merged visit or party bar writes SEVERAL bookings, and doing either
 * of those per mutation was what made the bar slow:
 *
 *   * invalidating per segment restarted the calendar's own refetch once per
 *     service, because `invalidateQueries` → `refetchQueries` defaults to
 *     `cancelRefetch: true` — it cancels an in-flight fetch and starts a new one.
 *   * patching per segment would take one snapshot per mutation, so reverting a
 *     failed segment could undo a sibling that had already succeeded.
 *
 * The screen owns both instead, once per bar action:
 * `patchCalendarGridBookings` before the writes, `revertCalendarGridBookings` for
 * whichever segments failed, `invalidateCalendarQuickAction` once at the end.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingStatus } from '@/types/booking-detail';
import type { CalendarGridBooking, CalendarGridResponse } from '@/types/calendar-grid';

type QueryClient = ReturnType<typeof useQueryClient>;

/** The fields a quick action can change on a grid row. */
export type CalendarBookingPatch = Partial<
  Pick<CalendarGridBooking, 'status' | 'client_arrived_at'>
>;

/** Previous values per booking id, for reverting a failed write. */
export type CalendarGridSnapshot = Map<string, CalendarBookingPatch>;

/** A cached value under `calendar.all()` that is actually a grid response. */
function isGridResponse(value: unknown): value is CalendarGridResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as CalendarGridResponse).calendars)
  );
}

/**
 * Apply `patch` to every cached calendar-grid row whose id is in `ids`, and return
 * what those rows held before.
 *
 * This is what makes the bar respond on press rather than a round trip later: the
 * grid feed is the only source the bar's colour and button set read from, and
 * nothing else was writing to it optimistically (the booking detail panel's
 * `optimisticStatusPatch` covers `bookings.*` only, which is why IT felt instant
 * and the calendar did not).
 *
 * Rows are matched across every cached range, so a booking visible in more than
 * one loaded range moves everywhere at once. The returned snapshot keeps the first
 * value seen per id — they agree, being the same row.
 */
export function patchCalendarGridBookings(
  queryClient: QueryClient,
  ids: readonly string[],
  patch: CalendarBookingPatch,
): CalendarGridSnapshot {
  const wanted = new Set(ids);
  const previous: CalendarGridSnapshot = new Map();
  if (wanted.size === 0) return previous;

  queryClient.setQueriesData<CalendarGridResponse>(
    { queryKey: queryKeys.calendar.all() },
    (old) => {
      if (!isGridResponse(old)) return old;
      // Per-level flags, so an untouched calendar or day keeps its identity and
      // does not re-render a column the press had nothing to do with.
      let anyChanged = false;
      const calendars = old.calendars.map((calendar) => {
        let calendarChanged = false;
        const dates = calendar.dates.map((day) => {
          if (!day.bookings.some((b) => wanted.has(b.id))) return day;
          calendarChanged = true;
          anyChanged = true;
          const bookings = day.bookings.map((booking) => {
            if (!wanted.has(booking.id)) return booking;
            if (!previous.has(booking.id)) {
              previous.set(booking.id, {
                status: booking.status,
                client_arrived_at: booking.client_arrived_at ?? null,
              });
            }
            return { ...booking, ...patch };
          });
          return { ...day, bookings };
        });
        return calendarChanged ? { ...calendar, dates } : calendar;
      });
      return anyChanged ? { ...old, calendars } : old;
    },
  );

  return previous;
}

/**
 * Put back the rows a write failed for. Only the ids in `snapshot` move, so a
 * part-failed bar keeps the segments that did land.
 */
export function revertCalendarGridBookings(
  queryClient: QueryClient,
  snapshot: CalendarGridSnapshot,
): void {
  for (const [id, fields] of snapshot) {
    patchCalendarGridBookings(queryClient, [id], fields);
  }
}

/**
 * Reconcile after a bar action — ONCE, not once per segment.
 *
 * Class/event/resource blocks render from the separate schedule feed, and a
 * status/arrival change can clear a waitlist offer, so both are refreshed too
 * (parity with invalidateBookingCaches).
 */
export function invalidateCalendarQuickAction(
  queryClient: QueryClient,
  accessToken: string | null,
  bookingIds: readonly string[],
): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
  for (const bookingId of bookingIds) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.bookings.detail(accessToken, bookingId),
    });
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all() });
}

/**
 * PATCH /api/venue/bookings/[id] — quick status change from the calendar block tray.
 * bookingId is passed in the input so a single mutation instance serves all blocks.
 */
export function useCalendarStatusAction() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (input: {
      bookingId: string;
      status: BookingStatus;
      /**
       * The unpaid-promotion acknowledgement (`lib/booking/accept-unpaid.ts`).
       * Sent only as the replay after staff answer the guard sheet.
       */
      accept_unpaid?: true;
    }) => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch(`/api/venue/bookings/${input.bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({
          status: input.status,
          ...(input.accept_unpaid ? { accept_unpaid: true } : {}),
        }),
      });
    },
  });
}

/**
 * PATCH /api/venue/bookings/[id] — quick arrival toggle from the calendar block tray.
 */
export function useCalendarArrivalAction() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (input: { bookingId: string; client_arrived: boolean }) => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch(`/api/venue/bookings/${input.bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ client_arrived: input.client_arrived }),
      });
    },
  });
}
