/**
 * A guest's bookings as the web's "Guest bookings" accordion lays them out
 * (`GuestBookingsForGuestAccordion`, `lib/booking/guest-booking-upcoming.ts`):
 * upcoming visits first, soonest first, then previous visits, latest first.
 *
 * Upcoming means the visit's scheduled END is still ahead, judged in the venue's
 * timezone: a booking that is under way stays upcoming until it ends, and a
 * cancelled one is never upcoming, whatever its date. Without an end the start
 * decides ("today or later, and not yet started" for today's).
 */
import { calendarDateInTimeZone } from '@/lib/dates/venue-dates';
import { getDateTimeFormat } from '@/lib/dates/formatters';

export interface GuestHistoryScheduleRow {
  booking_date: string;
  /** "HH:mm" or "HH:mm:ss". */
  booking_time: string;
  status: string;
  /** An instant; the truest end when the server has one. */
  estimated_end_time?: string | null;
  /** A wall-clock "HH:mm[:ss]" on the booking's date. */
  booking_end_time?: string | null;
}

export interface GuestHistorySections<Row> {
  upcoming: Row[];
  previous: Row[];
}

/** The venue wall clock as "HH:mm". */
function wallClockHm(now: Date, timeZone: string): string {
  const parts = getDateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  // en-GB answers "24" for midnight in some engines.
  return `${hh === '24' ? '00' : hh}:${mm}`;
}

function hm(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length < 5) return null;
  return value.slice(0, 5);
}

/** Whether the booking's scheduled end is still ahead (web `isBookingUpcomingBeforeScheduledEnd`). */
export function isGuestBookingUpcoming(
  row: GuestHistoryScheduleRow,
  now: Date,
  timeZone: string,
): boolean {
  if (row.status === 'Cancelled') return false;

  const endIso = row.estimated_end_time?.trim();
  if (endIso) {
    const endMs = new Date(endIso).getTime();
    if (!Number.isNaN(endMs)) return now.getTime() < endMs;
  }

  const today = calendarDateInTimeZone(now, timeZone);
  if (row.booking_date > today) return true;
  if (row.booking_date < today) return false;

  const nowHm = wallClockHm(now, timeZone);
  const endHm = hm(row.booking_end_time);
  if (endHm) return nowHm < endHm;
  return (hm(row.booking_time) ?? '00:00') >= nowHm;
}

/** Split and order a guest's bookings as the web accordion does. */
export function splitGuestHistory<Row extends GuestHistoryScheduleRow>(
  rows: readonly Row[],
  now: Date,
  timeZone: string,
): GuestHistorySections<Row> {
  const upcoming: Row[] = [];
  const previous: Row[] = [];
  for (const row of rows) {
    (isGuestBookingUpcoming(row, now, timeZone) ? upcoming : previous).push(row);
  }
  const byStart = (a: Row, b: Row) =>
    a.booking_date.localeCompare(b.booking_date) || a.booking_time.localeCompare(b.booking_time);
  upcoming.sort(byStart);
  previous.sort((a, b) => byStart(b, a));
  return { upcoming, previous };
}

/** The collapsed accordion's hint (web `summaryHint`). */
export function guestBookingsSummary(sections: GuestHistorySections<unknown>): string {
  return `${sections.upcoming.length} upcoming · ${sections.previous.length} previous`;
}
