/**
 * "This calendar still has people booked on it" (web QA C-11, R44-2 and R44-4).
 *
 * Pausing a calendar warns with this list and goes ahead; removing one is
 * refused by the server (409) while the list is not empty. Both answers carry
 * the same three fields, so one parser reads the pre-check
 * (`GET /api/venue/practitioners/upcoming-bookings`) and the refusal
 * (`DELETE /api/venue/practitioners`).
 *
 * "Upcoming" is dated today or later in the venue's timezone, in status
 * Booked, Confirmed, Pending or Started: appointments, bookings for a resource
 * shown on the calendar, and class sessions or events on it with people booked.
 *
 * The app's mirror of the web's client-safe wire module; keep the shapes and
 * the wording in step with it.
 * @see C:\Resneo\src\lib\venue\calendar-upcoming-bookings.ts
 */
import { ApiError } from '@/lib/api/client';
import { formatShortDay } from '@/lib/dates/venue-dates';

/** `code` on the 409 from `DELETE /api/venue/practitioners`. Stable: the server promises it. */
export const CALENDAR_HAS_UPCOMING_BOOKINGS_CODE = 'CALENDAR_HAS_UPCOMING_BOOKINGS';

/** What kind of thing is booked. Appointments are the common case; the rest sit on a calendar too. */
export type CalendarUpcomingKind = 'appointment' | 'class' | 'event' | 'resource';

/**
 * One line of the list: an appointment, one day of a multi-service visit, or
 * one class session or event with people booked on it.
 */
export interface CalendarUpcomingBooking {
  /** Stable list key: the booking id, or the visit day, session or event it stands for. */
  key: string;
  kind: CalendarUpcomingKind;
  /** Every booking row this line stands for (a visit's services, a session's attendees). */
  booking_ids: string[];
  booking_date: string;
  /** HH:mm */
  booking_time: string;
  /** HH:mm, or null when the rows carry no resolvable end. */
  end_time: string | null;
  /** The client's name. For a class or an event, how many are booked ("3 booked"). */
  who: string;
  /** The service (a visit names each of its services once), class, event or resource. */
  what: string;
  status: string;
}

/** The answer to "who is still booked on this calendar from today on?". */
export interface CalendarUpcomingBookings {
  /** Exact number of lines, even when `bookings` is capped (25). A visit counts once per day. */
  total: number;
  bookings: CalendarUpcomingBooking[];
  truncated: boolean;
}

/** A handful on screen; the rest are counted on the last line (web shows six). */
export const CALENDAR_UPCOMING_SHOWN = 6;

/** "Mon 30 Nov, 10:00 to 10:45" */
export function calendarUpcomingWhenLabel(booking: CalendarUpcomingBooking): string {
  const range = booking.end_time
    ? `${booking.booking_time} to ${booking.end_time}`
    : booking.booking_time;
  return `${formatShortDay(booking.booking_date)}, ${range}`;
}

/**
 * Reads the pre-check body or the 409 from a refused removal. Returns null for
 * anything else, which the caller surfaces as a plain error.
 */
export function parseCalendarUpcomingBookings(payload: unknown): CalendarUpcomingBookings | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as {
    upcoming_bookings?: unknown;
    upcoming_total?: unknown;
    upcoming_truncated?: unknown;
  };
  if (!Array.isArray(body.upcoming_bookings)) return null;
  const bookings = body.upcoming_bookings as CalendarUpcomingBooking[];
  return {
    bookings,
    total: typeof body.upcoming_total === 'number' ? body.upcoming_total : bookings.length,
    truncated: body.upcoming_truncated === true,
  };
}

/**
 * The list on a refused removal: a 409 the server marked with
 * {@link CALENDAR_HAS_UPCOMING_BOOKINGS_CODE}. Null for every other failure
 * (the last-calendar guard, a lost connection), which keeps its own sentence.
 */
export function calendarRemovalRefusal(error: unknown): CalendarUpcomingBookings | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const body = error.body as { code?: unknown } | null | undefined;
  if (body?.code !== CALENDAR_HAS_UPCOMING_BOOKINGS_CODE) return null;
  const upcoming = parseCalendarUpcomingBookings(body);
  return upcoming && upcoming.total > 0 ? upcoming : null;
}

/**
 * One of the venue's own words, lower case and plural: "appointments",
 * "clients". Terms are single nouns the venue typed ("Appointment", "Session",
 * "Class"), so this only has to cope with the common English endings.
 */
export function pluralVenueTerm(term: string | null | undefined, fallback: string): string {
  const word = (term ?? '').trim().toLowerCase() || fallback;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** The venue's own word for a booking, counted: "1 appointment", "3 appointments". */
export function countedBookingTerm(count: number, bookingTerm: string | null | undefined): string {
  if (count === 1) return `1 ${(bookingTerm ?? '').trim().toLowerCase() || 'booking'}`;
  return `${count} ${pluralVenueTerm(bookingTerm, 'booking')}`;
}

/** Are they all appointments? A class, an event or a resource makes them "bookings". */
function onlyAppointments(upcoming: CalendarUpcomingBookings): boolean {
  return upcoming.bookings.every((b) => b.kind === 'appointment');
}

/**
 * "2 upcoming appointments", or "2 upcoming bookings" once a class, an event or
 * a resource is among them: those are bookings on the calendar, not appointments.
 */
export function describeUpcomingBookingCount(
  upcoming: CalendarUpcomingBookings,
  bookingTerm: string | null | undefined,
): string {
  return countedBookingTerm(
    upcoming.total,
    onlyAppointments(upcoming) ? bookingTerm : 'booking',
  ).replace(/^(\d+) /, '$1 upcoming ');
}

/** The venue's words this screen uses. */
export interface CalendarDialogTerms {
  client: string | null | undefined;
  booking: string | null | undefined;
}

/**
 * What pausing does, said before it happens (web `CalendarPauseDialog`). The
 * third line is true because the diary keeps a paused calendar's column on any
 * day it has bookings (R44-3, `lib/calendar/diary-columns`).
 */
export function calendarPauseConsequences(
  calendarName: string,
  upcoming: CalendarUpcomingBookings,
  terms: CalendarDialogTerms,
): string[] {
  const name = calendarName.trim() || 'This calendar';
  const bookings = onlyAppointments(upcoming) ? pluralVenueTerm(terms.booking, 'booking') : 'bookings';
  return [
    `${upcoming.total === 1 ? 'This one stays' : 'They all stay'} booked. Your ${pluralVenueTerm(terms.client, 'client')} are not told anything.`,
    `${name} stops taking new bookings, online and from your team.`,
    `${name} still shows on your diary on any day with ${bookings}, marked Paused, so nobody is missed.`,
  ];
}

/**
 * Where the question "who is still booked on it?" stands when the remove sheet
 * is showing its confirm:
 *  - `checking`: asked, not answered yet;
 *  - `clear`: nothing upcoming, the removal will go through;
 *  - `unknown`: the question failed, the server will still refuse if it must;
 *  - `unchecked`: the server has no such question (404, a web release before
 *    2026-10-01), so nothing is promised about a refusal either.
 */
export type CalendarRemoveCheckState = 'checking' | 'clear' | 'unknown' | 'unchecked';

/**
 * Where the remove sheet stands: its confirm with the pre-check's answer, or
 * `blocked` with the list of who is still booked, once the pre-check or the
 * server's 409 on the delete itself says the calendar cannot go yet.
 */
export type CalendarRemoveCheck =
  | { state: CalendarRemoveCheckState }
  | { state: 'blocked'; upcoming: CalendarUpcomingBookings };

/** True when the pre-check route itself is missing, not the calendar's answer. */
export function isUpcomingCheckUnsupported(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * What removing a calendar really does (web `BookableCalendarsPanel`). The old
 * line, "Existing bookings stay on the diary", was never true: a removed
 * calendar's bookings lose their column and are drawn nowhere.
 */
export function calendarRemoveConfirmMessage(
  calendarName: string,
  terms: CalendarDialogTerms,
  check: CalendarRemoveCheckState,
): string {
  const bookings = pluralVenueTerm(terms.booking, 'booking');
  const client = (terms.client ?? '').trim().toLowerCase() || 'client';
  if (check === 'checking') return `Checking ${calendarName} for upcoming ${bookings}…`;
  const removed =
    `${calendarName} will be removed for good, along with its working hours, breaks, closures and booking link. ` +
    `Team members who manage it are unassigned from it.`;
  const kept =
    `in your list of ${bookings} and on each ${client}'s record. ` +
    `They will no longer show which calendar they were on, and they no longer appear on your diary.`;
  if (check === 'clear') {
    return `${removed}\n\nIt has no upcoming ${bookings}. Past and cancelled ${bookings} are kept, with their history, ${kept}`;
  }
  if (check === 'unknown') {
    return `${removed}\n\nWe could not check for upcoming ${bookings} just now. If ${calendarName} has any, it will not be removed and you will see them listed here.`;
  }
  return `${removed}\n\nAnything already booked on ${calendarName} is kept ${kept}`;
}

/** The line under a refused removal's list: what to do about it. */
export function calendarRemoveBlockedAdvice(
  calendarName: string,
  upcoming: CalendarUpcomingBookings,
  isActive: boolean,
): string[] {
  return [
    `Move or cancel ${upcoming.total === 1 ? 'it' : 'them'} first, then remove the calendar.`,
    isActive
      ? `To stop new bookings in the meantime, pause ${calendarName} instead: switch Active (bookable) off on its card. Everything already booked stays on your diary.`
      : `${calendarName} is paused, so it takes no new bookings. Everything already booked stays on your diary.`,
  ];
}
