/**
 * The dates and counts on a contact's profile header — port of the web
 * `src/lib/guests/contact-formatting.ts` plus the two header labels from
 * `ContactDetailPanel.tsx` (~250-270): the visit-count pill and the
 * "N bookings on file" line.
 *
 * `today` is the venue's calendar day. The web compares against the browser's
 * local day; the app knows the venue's timezone, so callers pass it and a venue
 * an hour away still reads "Today" correctly.
 */
import { addDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns';

/** Midday on a calendar date — avoids any DST edge when only the day matters. */
function middayOf(isoDate: string): Date {
  return parseISO(`${isoDate}T12:00:00`);
}

function localCalendarDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** "10 days ago" — the web's wide-screen rendering of a last visit. */
export function formatRelativeVisitDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  try {
    return formatDistanceToNowStrict(middayOf(isoDate), { addSuffix: true });
  } catch {
    return isoDate;
  }
}

/** "Today" / "Tomorrow" / "Mon 1 Sep" — the web's `formatCalendarDayShort`. */
export function formatCalendarDayShort(
  isoDate: string | null | undefined,
  today: string = localCalendarDate(),
): string {
  if (!isoDate) return '—';
  try {
    const day = middayOf(isoDate);
    if (Number.isNaN(day.getTime())) return isoDate;
    if (isoDate === today) return 'Today';
    if (isoDate === format(addDays(middayOf(today), 1), 'yyyy-MM-dd')) return 'Tomorrow';
    return format(day, 'EEE d MMM');
  } catch {
    return isoDate;
  }
}

/** "Today 14:30" / "Mon 1 Sep 09:00" — the web's `formatNextBookingSummary`. */
export function formatNextBookingSummary(
  date: string | null | undefined,
  time: string | null | undefined,
  today: string = localCalendarDate(),
): string | null {
  if (!date) return null;
  const day = formatCalendarDayShort(date, today);
  if (day === '—') return null;
  const clock = time ? time.slice(0, 5) : null;
  return clock ? `${day} ${clock}` : day;
}

/** The pill beside the name: "3 visits", or "New" for a contact with none. */
export function visitCountLabel(visitCount: number): string {
  if (!Number.isFinite(visitCount) || visitCount <= 0) return 'New';
  return `${visitCount} visit${visitCount !== 1 ? 's' : ''}`;
}

/** "4 appointments on file" / "No past appointments yet", in the venue's word. */
export function bookingsOnFileLabel(totalBookings: number, bookingWord: string): string {
  const word = bookingWord.toLowerCase();
  if (!Number.isFinite(totalBookings) || totalBookings <= 0) return `No past ${word}s yet`;
  return `${totalBookings} ${word}${totalBookings !== 1 ? 's' : ''} on file`;
}
