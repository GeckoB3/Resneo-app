/**
 * What `PATCH /api/venue/visits/[id]/schedule` is asked for.
 *
 * Since web #187 the endpoint takes exactly one of two things: a `shift` of the
 * whole visit (every service moves by the same amount, keeping its gaps), or a
 * `services` list naming the rows to change, each with the date, start,
 * calendar and length asked for. The old whole-visit fields are gone, and a
 * body with neither is refused. Every editor in the app — the calendar's drag
 * and its undo, the quick Reschedule sheet, the Modify sheet's check, save and
 * undo — builds its body here so they cannot disagree about which mode an edit
 * is.
 *
 * The rule: a move alone is a shift. A length change is per-service, and the
 * minutes land on the LAST service (web's "extra time goes on the tail"; a
 * shrink comes off it, down to its floor). When a length change rides with a
 * move, every row is named with its shifted start so the write stays one
 * request, which is what makes it all-or-nothing.
 */

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import type { VisitEditService } from '@/lib/booking/appointment-visit';
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
  /** The visit's start when the editor opened, HH:mm[:ss]. */
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
}

/**
 * The mode-specific part of the body: `{ shift }` or
 * `{ services, known_booking_ids }`. Flags are the caller's.
 */
export function visitScheduleRequest(
  args: VisitScheduleRequestArgs,
): Pick<VisitSchedulePatchInput, 'shift' | 'services' | 'known_booking_ids'> {
  const lengthChanged =
    args.fromTotalMinutes != null &&
    args.toTotalMinutes != null &&
    args.toTotalMinutes !== args.fromTotalMinutes;

  if (!lengthChanged) {
    return {
      shift: {
        booking_date: args.toDate,
        booking_time: toHms(args.toTime),
        ...(args.practitionerId ? { practitioner_id: args.practitionerId } : {}),
      },
    };
  }

  const delta = timeToMinutes(args.toTime) - timeToMinutes(args.fromTime);
  const grow = args.toTotalMinutes! - args.fromTotalMinutes!;
  const tailIndex = args.services.length - 1;
  const services: VisitScheduleServiceInput[] = args.services.map((row, index) => {
    const start = (((timeToMinutes(row.startHm) + delta) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    return {
      booking_id: row.bookingId,
      booking_date: args.toDate,
      booking_time: toHms(minutesToTime(start)),
      ...(args.practitionerId ? { practitioner_id: args.practitionerId } : {}),
      ...(index === tailIndex
        ? { duration_minutes: Math.max(MIN_CORE_DURATION_MINUTES, row.durationMinutes + grow) }
        : {}),
    };
  });
  return {
    services,
    known_booking_ids: args.services.map((row) => row.bookingId),
  };
}

/**
 * The body that puts a visit back exactly as an editor found it: every row
 * named with the date, start, calendar and length it had. Used for Undo, where
 * a shift back would be right for a move but cannot restore a length.
 */
export function visitRestoreRequest(args: {
  services: readonly VisitEditService[];
  date: string;
  practitionerId?: string | null;
}): Pick<VisitSchedulePatchInput, 'services' | 'known_booking_ids'> {
  return {
    services: args.services.map((row) => ({
      booking_id: row.bookingId,
      booking_date: args.date,
      booking_time: toHms(row.startHm),
      ...(args.practitionerId ? { practitioner_id: args.practitionerId } : {}),
      duration_minutes: row.durationMinutes,
    })),
    known_booking_ids: args.services.map((row) => row.bookingId),
  };
}
