/**
 * What `PATCH /api/venue/visits/[id]/schedule` is asked for.
 *
 * Since web #187 the endpoint takes exactly one of two things: a `shift` of the
 * whole visit (every service moves by the same amount, keeping its gaps and any
 * cross-day offset), or a `services` list naming the rows to change, each with
 * the date, start, calendar and length asked for. The old whole-visit fields
 * are gone, and a body with neither is refused. Every editor in the app — the
 * calendar's drag and its undo, the quick Reschedule sheet, the Modify sheet's
 * check, save and undo — builds its body here so they cannot disagree about
 * which mode an edit is.
 *
 * The rule: a move alone is a shift. A length change is per-service, and the
 * minutes land on the LAST service (web's "extra time goes on the tail"; a
 * shrink comes off it, down to its floor). When a length change rides with a
 * move, every row is named with its shifted day and start so the write stays
 * one request, which is what makes it all-or-nothing. A caller that can only
 * see part of the visit (the calendar holds one day) asks for `services` and
 * names what it sees, so a service on another day is left where it is.
 */

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { dayOffset, shiftYmd, type VisitEditService } from '@/lib/booking/appointment-visit';
import { MIN_CORE_DURATION_MINUTES } from '@/lib/booking/booking-core-duration';
import type {
  VisitScheduleServiceInput,
  VisitSchedulePatchInput,
  VisitServiceLineInput,
} from '@/lib/queries/useVisitMutations';

const DAY_MINUTES = 24 * 60;

/**
 * Whether a visit's services are with more than one person (split-visit plan
 * 8.8, G12). Such a visit has no single calendar: each service keeps its own,
 * the whole-visit calendar picker is not offered, and no request names one
 * calendar for every row. A row with no calendar counts as `fallbackCalendarId`.
 */
export function isMultiCalendarVisit(
  services: readonly Pick<VisitEditService, 'calendarId'>[],
  fallbackCalendarId: string | null | undefined,
): boolean {
  if (services.length < 2) return false;
  return new Set(services.map((s) => s.calendarId || fallbackCalendarId || '')).size > 1;
}

/** One line of a visit's service list, as an editor holds it. */
export interface VisitServiceLineDraft {
  /** The row this line keeps, or null for a service being added. */
  bookingId: string | null;
  serviceId: string;
  variantId: string | null;
  /** Who does an ADDED service. A kept line's calendar comes from `rowCalendarId`. */
  calendarId?: string | null;
}

/**
 * The `services` lines for `PATCH /api/venue/visits/{id}/services` (split-visit
 * plan 8.8, G11), mirroring web `StaffAppointmentModifyForm`'s request.
 *
 * Every line names who does it. On a visit with more than one person a kept
 * service stays with its own (the server refuses 409
 * `calendar_per_service_required` when a line of such a visit names none); on a
 * one-person visit every kept service follows the visit's calendar, as before.
 * An added service goes on the calendar chosen for it.
 */
export function visitServiceLinesRequest(args: {
  lines: readonly VisitServiceLineDraft[];
  multiCalendar: boolean;
  /** The calendar a kept row is on (or has been given by its own editor). */
  rowCalendarId: (bookingId: string) => string | null | undefined;
  /** The visit's calendar: the one chosen for a one-person visit, else the opened row's. */
  visitCalendarId: string | null | undefined;
}): VisitServiceLineInput[] {
  return args.lines.map((line) => {
    const calendarId =
      line.bookingId == null
        ? line.calendarId || args.visitCalendarId
        : args.multiCalendar
          ? args.rowCalendarId(line.bookingId) || args.visitCalendarId
          : args.visitCalendarId;
    return {
      ...(line.bookingId ? { booking_id: line.bookingId } : {}),
      service_id: line.serviceId,
      service_variant_id: line.variantId,
      ...(calendarId ? { calendar_id: calendarId } : {}),
    };
  });
}

/**
 * Who does a service being added, to start with (web `addServiceLine`): the
 * person of the service before it, else the visit's calendar, else the first
 * person who offers it, else the person before it anyway (the server then says
 * why not).
 */
export function defaultAddedServiceCalendar(args: {
  lines: readonly VisitServiceLineDraft[];
  serviceId: string;
  rowCalendarId: (bookingId: string) => string | null | undefined;
  visitCalendarId: string | null | undefined;
  /** Whether a calendar offers the service. */
  offers: (calendarId: string, serviceId: string) => boolean;
  /** The calendars this person may book on that offer the service, in order. */
  offeringCalendars: (serviceId: string) => readonly string[];
}): string | null {
  const last = args.lines[args.lines.length - 1];
  const lastCalendar =
    (last
      ? last.calendarId || (last.bookingId ? args.rowCalendarId(last.bookingId) : null)
      : null) ||
    args.visitCalendarId ||
    null;
  if (lastCalendar && args.offers(lastCalendar, args.serviceId)) return lastCalendar;
  if (args.visitCalendarId && args.offers(args.visitCalendarId, args.serviceId)) {
    return args.visitCalendarId;
  }
  return args.offeringCalendars(args.serviceId)[0] ?? lastCalendar;
}

/** HH:mm or HH:mm:ss → HH:mm:ss */
function toHms(time: string): string {
  return `${time.slice(0, 5)}:00`;
}

export interface VisitScheduleRequestArgs {
  /** The visit's rows as the editor opened them. */
  services: readonly VisitEditService[];
  /** The visit's start when the editor opened: YYYY-MM-DD and HH:mm[:ss]. */
  fromDate: string;
  fromTime: string;
  /** Where the visit is going. */
  toDate: string;
  /** HH:mm[:ss] */
  toTime: string;
  /** A chosen calendar; omitted, every service keeps its own. */
  practitionerId?: string | null;
  /**
   * The visit's length when the editor opened and the length asked for. Equal
   * (or absent) means the lengths are untouched.
   */
  fromTotalMinutes?: number | null;
  toTotalMinutes?: number | null;
  /**
   * Always name the rows rather than shifting the visit. For a caller that
   * holds only part of the visit: what it names moves, the rest stays.
   */
  mode?: 'auto' | 'services';
  /**
   * Send `known_booking_ids` with a `services` body. Off for a caller that
   * cannot know every row of the visit (the endpoint would answer 412).
   */
  guardKnownRows?: boolean;
}

/**
 * The mode-specific part of the body: `{ shift }` or
 * `{ services, known_booking_ids? }`. Flags are the caller's.
 */
export function visitScheduleRequest(
  args: VisitScheduleRequestArgs,
): Pick<VisitSchedulePatchInput, 'shift' | 'services' | 'known_booking_ids'> {
  const lengthChanged =
    args.fromTotalMinutes != null &&
    args.toTotalMinutes != null &&
    args.toTotalMinutes !== args.fromTotalMinutes;

  if (!lengthChanged && args.mode !== 'services') {
    return {
      shift: {
        booking_date: args.toDate,
        booking_time: toHms(args.toTime),
        ...(args.practitionerId ? { practitioner_id: args.practitionerId } : {}),
      },
    };
  }

  const dayDelta = dayOffset(args.fromDate, args.toDate);
  const minuteDelta = timeToMinutes(args.toTime) - timeToMinutes(args.fromTime);
  const grow = lengthChanged ? args.toTotalMinutes! - args.fromTotalMinutes! : 0;
  const tailIndex = args.services.length - 1;
  const services: VisitScheduleServiceInput[] = args.services.map((row, index) => {
    const start = (((timeToMinutes(row.startHm) + minuteDelta) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    // A row on its own day keeps its offset from the visit's first day.
    const date = row.date ? shiftYmd(row.date, dayDelta) : args.toDate;
    return {
      booking_id: row.bookingId,
      booking_date: date,
      booking_time: toHms(minutesToTime(start)),
      ...(args.practitionerId ? { practitioner_id: args.practitionerId } : {}),
      ...(lengthChanged && index === tailIndex
        ? { duration_minutes: Math.max(MIN_CORE_DURATION_MINUTES, row.durationMinutes + grow) }
        : {}),
    };
  });
  return {
    services,
    ...(args.guardKnownRows === false
      ? {}
      : { known_booking_ids: args.services.map((row) => row.bookingId) }),
  };
}

/**
 * The body that puts a visit back exactly as an editor found it: every row
 * named with the date, start, calendar and length it had. Used for Undo, where
 * a shift back would be right for a move but cannot restore a length.
 *
 * Each row goes back to its OWN calendar (split-visit plan G12). A visit's
 * services can be with different people, and naming one calendar for every row
 * moved them all onto it. `practitionerId` is only the fallback for a row that
 * did not say which calendar it was on.
 */
export function visitRestoreRequest(args: {
  services: readonly VisitEditService[];
  /** The day for a row that carried none. */
  date: string;
  /** The calendar for a row that carried none. */
  practitionerId?: string | null;
  guardKnownRows?: boolean;
}): Pick<VisitSchedulePatchInput, 'services' | 'known_booking_ids'> {
  return {
    services: args.services.map((row) => {
      const calendarId = row.calendarId || args.practitionerId || null;
      return {
        booking_id: row.bookingId,
        booking_date: row.date ?? args.date,
        booking_time: toHms(row.startHm),
        ...(calendarId ? { practitioner_id: calendarId } : {}),
        duration_minutes: row.durationMinutes,
      };
    }),
    ...(args.guardKnownRows === false
      ? {}
      : { known_booking_ids: args.services.map((row) => row.bookingId) }),
  };
}

/** One service of a visit as the Modify sheet's per-service editors hold it. */
export interface VisitServiceEdit {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  calendarId: string | null;
  durationMinutes: number;
}

/**
 * The body for per-service edits (web #187 `services` mode, the Modify sheet's
 * second mode): only the rows whose edit differs from the baseline are named,
 * each with exactly the day, start, calendar and length asked for; a service
 * not named is left where it is. `known_booking_ids` lists every row the sheet
 * opened on, so the write cannot land on a visit that has since gained one.
 */
export function visitServiceEditsRequest(args: {
  rowIds: readonly string[];
  edits: Readonly<Record<string, VisitServiceEdit>>;
  baseline: Readonly<Record<string, VisitServiceEdit>>;
}): Pick<VisitSchedulePatchInput, 'services' | 'known_booking_ids'> {
  const services: VisitScheduleServiceInput[] = [];
  for (const id of args.rowIds) {
    const edit = args.edits[id];
    const base = args.baseline[id];
    if (!edit || !base) continue;
    if (
      edit.date === base.date &&
      edit.time === base.time &&
      edit.calendarId === base.calendarId &&
      edit.durationMinutes === base.durationMinutes
    ) {
      continue;
    }
    services.push({
      booking_id: id,
      booking_date: edit.date,
      booking_time: toHms(edit.time),
      ...(edit.calendarId ? { practitioner_id: edit.calendarId } : {}),
      duration_minutes: Math.max(MIN_CORE_DURATION_MINUTES, edit.durationMinutes),
    });
  }
  return { services, known_booking_ids: [...args.rowIds] };
}
