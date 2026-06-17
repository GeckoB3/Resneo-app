import { calendarDateInTimeZone } from '@/lib/dates/venue-dates';

/** Current wall-clock time (minutes since midnight) in the given timezone. */
export function nowMinutesInTz(timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/** Clamp a venue's configured no-show grace to the web's 10–60 range (default 15). */
export function clampNoShowGraceMinutes(graceMinutes: number | null | undefined): number {
  return Math.min(60, Math.max(10, graceMinutes ?? 15));
}

/**
 * Web parity (`canMarkNoShowForSlot`): no-show may only be marked once the
 * booking's start time plus the venue's grace window has passed, in the venue
 * timezone. Past days are always allowed; future days never are; on the booking
 * day we compare wall-clock minutes. The backend still enforces this — the guard
 * just keeps the UI from offering an action that would be rejected.
 *
 * Shared by the booking detail toolbar and the bookings-list swipe action so the
 * two surfaces gate identically (avoids a flip-then-rollback flicker on the list).
 */
export function canMarkNoShowForSlot(
  bookingDate: string,
  bookingTime: string,
  graceMinutes: number,
  timeZone: string,
): boolean {
  const todayInVenue = calendarDateInTimeZone(new Date(), timeZone);
  if (bookingDate < todayInVenue) return true;
  if (bookingDate > todayInVenue) return false;
  const [h, m] = bookingTime.slice(0, 5).split(':').map(Number);
  const startMinutes = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  return nowMinutesInTz(timeZone) >= startMinutes + graceMinutes;
}
