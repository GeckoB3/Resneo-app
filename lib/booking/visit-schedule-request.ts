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
} from '@/lib/queries/useVisitMutations';

const DAY_MINUTES = 24 * 60;

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
 */
export function visitRestoreRequest(args: {
  services: readonly VisitEditService[];
  /** The day for a row that carried none. */
  date: string;
  practitionerId?: string | null;
  guardKnownRows?: boolean;
}): Pick<VisitSchedulePatchInput, 'services' | 'known_booking_ids'> {
  return {
    services: args.services.map((row) => ({
      booking_id: row.bookingId,
      booking_date: row.date ?? args.date,
      booking_time: toHms(row.startHm),
      ...(args.practitionerId ? { practitioner_id: args.practitionerId } : {}),
      duration_minutes: row.durationMinutes,
    })),
    ...(args.guardKnownRows === false
      ? {}
      : { known_booking_ids: args.services.map((row) => row.bookingId) }),
  };
}
