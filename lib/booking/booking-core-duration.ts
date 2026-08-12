import { timeToMinutes } from '@/components/calendar/grid-layout';

/**
 * The core duration a booking ALREADY has — ported from web
 * `src/lib/booking/booking-core-duration.ts`.
 *
 * Two end columns exist and BOTH have to be read. `bookings.booking_end_time`
 * (venue-local wall clock) is only written when the create request supplies one,
 * and among the guest booking flows only the resource ones do — so it is NULL
 * for every guest-created appointment. Those rows carry their end in
 * `estimated_end_time` instead, which create always writes.
 *
 * Reading `booking_end_time` alone and defaulting the miss to 30 minutes is the
 * bug this replaces: a 90-minute guest-booked appointment opened in the Modify
 * sheet proposed shrinking itself to half an hour, and saving handed the
 * practitioner's hour back to availability. Web hit the same thing and fixed it
 * the same way.
 */

/**
 * Floor for a resolved span. The API floor is 5
 * (`MIN_APPOINTMENT_CORE_DURATION_MINUTES`, deliberately lower than web's 15 —
 * see the service schema), so clamping any higher here would misreport a real
 * short appointment as longer than it is. It exists only to stop a garbage end
 * time resolving to something the engine cannot book.
 */
export const MIN_CORE_DURATION_MINUTES = 5;

export interface BookingCoreDurationSource {
  /** Venue-local start, HH:mm or HH:mm:ss. */
  booking_time: string;
  /** Venue-local wall-clock end of the bookable segment, when the row has one. */
  booking_end_time?: string | null;
  /**
   * End instant written by create/modify as the venue-local wall clock encoded
   * as UTC (see `Date.UTC(...)` in the create routes), so reading it back with
   * `toISOString()` returns that wall clock again.
   */
  estimated_end_time?: string | null;
}

/** Minutes from `startHm` to `endHm`, wrapping past midnight. Null when degenerate. */
function spanMinutes(startHm: string, endHm: string): number | null {
  const start = timeToMinutes(startHm);
  const end = timeToMinutes(endHm);
  // An end equal to the start is a broken row, not a 24-hour booking: report no
  // duration rather than a day-long one. (Web's shared helper wraps on `<=` and
  // would return 1440 here.)
  if (end === start) return null;
  const span = end > start ? end - start : end + 24 * 60 - start;
  return Math.max(MIN_CORE_DURATION_MINUTES, span);
}

/**
 * The core duration a booking ALREADY has, or null when the row carries no
 * usable end time at all.
 *
 * Null is deliberate, not a defect: callers must decide what an unknown
 * duration means rather than inherit a made-up number. The Modify sheet adopts
 * the service's catalogue duration; read-only surfaces render nothing.
 */
export function resolveBookingCoreDurationMinutes(
  booking: BookingCoreDurationSource,
): number | null {
  const start = booking.booking_time?.slice(0, 5);
  if (!start || start.length < 5) return null;

  const wallEnd = booking.booking_end_time?.trim();
  if (wallEnd && wallEnd.length >= 5) {
    return spanMinutes(start, wallEnd.slice(0, 5));
  }

  const iso = booking.estimated_end_time?.trim();
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return spanMinutes(start, d.toISOString().slice(11, 16));
    }
  }

  return null;
}
