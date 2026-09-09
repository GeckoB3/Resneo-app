/**
 * A multi-service visit as one booking.
 *
 * A visit is stored as N rows in `bookings` sharing a `group_booking_id`. Only
 * the calendar ever merged them ({@link clusterCalendarBookings}), so the detail
 * panel and the modify sheet each opened a SINGLE row: a three-service visit
 * showed one service's time and one service's duration, and editing that row
 * left the others where they were. That is not just a display fault — shortening
 * the first service opened dead time before the second, and moving it detached
 * the visit's head from its tail.
 *
 * Everything that presents or edits a visit reads through here, so the rows stay
 * an implementation detail (as they already are for price, which has been
 * visit-level all along).
 *
 * Ported from web `src/lib/booking/appointment-visit.ts`. Three deliberate
 * adaptations, each marked below: nullable `booking_time`, status filtering, and
 * requiring two services. The re-laying arithmetic (`resequenceVisit`,
 * `distributeVisitDuration`) is NOT ported — the app sends a wall-clock total to
 * `PATCH /api/venue/visits/{id}/schedule` and the server distributes it, so a
 * client copy would be a second opinion with no reader.
 *
 * @see Docs/APP_GAP_REPORT_R15_WEB_DELTA.md (R15-2, R15-3)
 */

import { timeToMinutes } from '@/components/calendar/grid-layout';
import { MIN_CORE_DURATION_MINUTES } from '@/lib/booking/booking-core-duration';

/**
 * The statuses that put a service on the calendar.
 *
 * A cancelled or no-show row keeps its `group_booking_id`, but it is no longer
 * part of the visit's shape: including one would stretch the reported span over
 * a service that is not happening. Matches `SCHEDULED_STATUSES` on the web visit
 * endpoints, so what the header shows is what the endpoint will re-lay.
 */
const SCHEDULED_STATUSES = new Set(['Pending', 'Booked', 'Confirmed', 'Seated']);

/**
 * One booking row of a visit. A superset of what
 * {@link GroupVisitBookingRow} carries, so the group-visit query feeds this
 * directly.
 */
export interface VisitServiceRow {
  id: string;
  /**
   * Venue-local start, HH:mm or HH:mm:ss. Nullable here where web types it as a
   * required string: the app's bookings-list row allows null, and a row with no
   * start cannot be laid out at all (see {@link resolveAppointmentVisit}).
   */
  booking_time?: string | null;
  /** Venue-local wall-clock end of the bookable segment. */
  booking_end_time?: string | null;
  status?: string | null;
  group_booking_id?: string | null;
  /**
   * Set only on multi-PERSON group bookings (a party). Its presence is what
   * separates a party from a multi-service visit; they share the same column.
   */
  person_label?: string | null;
  booking_item_name?: string | null;
  service_variant_name?: string | null;
  addons_total_duration_minutes?: number | null;
  /**
   * Each service of a visit has its own day and calendar since web #187 (the
   * services are independent). Absent on a feed that only ever holds one day.
   */
  booking_date?: string | null;
  calendar_id?: string | null;
  practitioner_id?: string | null;
}

export interface VisitService {
  id: string;
  name: string | null;
  /** YYYY-MM-DD, when the row carried one. */
  date: string | null;
  calendarId: string | null;
  startHm: string;
  endHm: string;
  /** Wall-clock minutes this service occupies, add-on minutes included. */
  durationMinutes: number;
  /**
   * Minutes observed between this service's end and the next one's start,
   * across days when the next one is on another day. Zero on the tail.
   */
  gapAfterMinutes: number;
}

export interface AppointmentVisit {
  groupBookingId: string | null;
  /** In order of date, then start. */
  services: VisitService[];
  startHm: string;
  endHm: string;
  /** The first service's day and the last one's, when the rows carried dates. */
  startDate: string | null;
  endDate: string | null;
  /** The services sit on more than one day; `totalMinutes` then counts across them. */
  spansDays: boolean;
  /** The services sit on more than one calendar. */
  spansCalendars: boolean;
  /** Wall-clock span from the first service's start to the last one's end. */
  totalMinutes: number;
  /** Sum of the services themselves, excluding the gaps between them. */
  serviceMinutes: number;
}

const DAY_MS = 86_400_000;

/** Whole days from one YYYY-MM-DD to another; 0 when either is missing or malformed. */
export function dayOffset(fromYmd: string | null | undefined, toYmd: string | null | undefined): number {
  const a = ymdToUtcMs(fromYmd);
  const b = ymdToUtcMs(toYmd);
  if (a == null || b == null) return 0;
  return Math.round((b - a) / DAY_MS);
}

/** YYYY-MM-DD moved by `days`; the input unchanged when it is not a date. */
export function shiftYmd(ymd: string, days: number): string {
  const ms = ymdToUtcMs(ymd);
  if (ms == null || days === 0) return ymd;
  return new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
}

function ymdToUtcMs(ymd: string | null | undefined): number | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function toHm(raw: string | null | undefined): string {
  return String(raw ?? '').slice(0, 5);
}

/**
 * Minutes since midnight → "HH:mm", wrapping past midnight.
 *
 * Deliberately NOT `minutesToTime` from grid-layout, which CLAMPS to 23:59: a
 * visit running from 23:30 for an hour would report an end of 23:59, replacing
 * missing information with wrong information.
 */
function minutesToHm(mins: number): string {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** Minutes from start to end, tolerating a span that runs past midnight. */
function spanMinutes(startHm: string, endHm: string): number {
  const d = timeToMinutes(endHm) - timeToMinutes(startHm);
  return d < 0 ? d + 1440 : d;
}

/** A usable venue-local clock time: "HH:mm" or "HH:mm:ss". */
function hasUsableTime(raw: string | null | undefined): boolean {
  return typeof raw === 'string' && /^\d{2}:\d{2}/.test(raw.trim());
}

/**
 * True when these rows are one guest's several services rather than a party.
 *
 * A party shares the same `group_booking_id`, so treating every group as a visit
 * would merge four people's bookings into one appointment — and, worse, offer to
 * re-lay them back to back.
 */
export function isServiceVisit(rows: readonly VisitServiceRow[]): boolean {
  if (rows.length === 0) return false;
  return !rows.some((r) => Boolean(r.person_label?.trim()));
}

/** The rows of a visit that are actually on the calendar. */
export function scheduledVisitRows<T extends VisitServiceRow>(rows: readonly T[]): T[] {
  return rows.filter((r) => SCHEDULED_STATUSES.has(String(r.status ?? '')));
}

/**
 * The absolute floor for a visit of `serviceCount` services, gaps excluded.
 *
 * The server's floor is higher — it adds each service's configured buffer, which
 * it reads from the catalogue and the app never sees. Staying BELOW the server's
 * floor is the point: a client clamp can then never put a legitimate value out of
 * reach, and asking for something genuinely too short comes back from the dry run
 * naming the real minimum ("This visit cannot be shorter than N minutes with the
 * services it has"), which is better copy than anything derivable here.
 */
export function minimumVisitFloorMinutes(serviceCount: number): number {
  return Math.max(1, serviceCount) * MIN_CORE_DURATION_MINUTES;
}

/**
 * Builds the visit view of a set of rows, or null when they are not one.
 *
 * Returns null for a party, for rows that do not share a `group_booking_id`, and
 * for a row with no usable start time — callers cannot accidentally present
 * unrelated or unplaceable bookings as a single visit.
 *
 * Two adaptations from web, both narrowing:
 * - Cancelled and no-show rows are dropped first (web resolves whatever its
 *   caller passes; its endpoints filter separately, so its header can span a
 *   service that is not happening).
 * - Fewer than TWO scheduled services returns null. A lone service in a group is
 *   an ordinary booking, and every caller here wants the single-row path for it —
 *   the same rule `collapseMultiServiceVisits` and `GroupVisitCards` already use.
 */
export function resolveAppointmentVisit(
  rows: readonly VisitServiceRow[],
): AppointmentVisit | null {
  if (rows.length === 0 || !isServiceVisit(rows)) return null;

  const scheduled = scheduledVisitRows(rows);
  if (scheduled.length < 2) return null;
  if (scheduled.some((r) => !hasUsableTime(r.booking_time))) return null;

  const groupIds = new Set(scheduled.map((r) => r.group_booking_id?.trim() || ''));
  if (groupIds.size !== 1) return null;
  const groupBookingId = [...groupIds][0] || null;

  // Date first (a service on another day sorts after every service on this
  // one, whatever its clock time), then start.
  const ordered = [...scheduled].sort(
    (a, b) =>
      (a.booking_date ?? '').localeCompare(b.booking_date ?? '') ||
      timeToMinutes(toHm(a.booking_time)) - timeToMinutes(toHm(b.booking_time)),
  );
  const firstDate = ordered[0]!.booking_date ?? null;
  // Minutes from the first service's midnight, so spans and gaps count across days.
  const absolute = (row: VisitServiceRow, hm: string) =>
    dayOffset(firstDate, row.booking_date ?? firstDate) * 1440 + timeToMinutes(hm);

  const services: VisitService[] = ordered.map((row, i) => {
    const startHm = toHm(row.booking_time);
    const addonMinutes = Math.max(0, Math.round(row.addons_total_duration_minutes ?? 0));
    const endHm = hasUsableTime(row.booking_end_time)
      ? toHm(row.booking_end_time)
      : minutesToHm(timeToMinutes(startHm) + addonMinutes);
    const durationMinutes = spanMinutes(startHm, endHm);
    const next = ordered[i + 1];
    const gapAfterMinutes = next
      ? Math.max(0, absolute(next, toHm(next.booking_time)) - (absolute(row, startHm) + durationMinutes))
      : 0;
    return {
      id: row.id,
      name: row.booking_item_name ?? null,
      date: row.booking_date ?? null,
      calendarId: row.calendar_id ?? row.practitioner_id ?? null,
      startHm,
      endHm,
      durationMinutes,
      gapAfterMinutes,
    };
  });

  const first = services[0]!;
  const last = services[services.length - 1]!;
  const dates = new Set(services.map((s) => s.date ?? ''));
  const calendars = new Set(services.map((s) => s.calendarId ?? ''));
  const totalMinutes =
    dates.size > 1
      ? absolute(ordered[ordered.length - 1]!, last.startHm) + last.durationMinutes - timeToMinutes(first.startHm)
      : spanMinutes(first.startHm, last.endHm);

  return {
    groupBookingId,
    services,
    startHm: first.startHm,
    endHm: last.endHm,
    startDate: first.date,
    endDate: last.date,
    spansDays: dates.size > 1,
    spansCalendars: calendars.size > 1,
    totalMinutes,
    serviceMinutes: services.reduce((sum, s) => sum + s.durationMinutes, 0),
  };
}

/** "Cut & Blow Dry, Olaplex Treatment, Toner" — the visit's services, in order. */
export function visitServiceNames(visit: AppointmentVisit): string[] {
  return visit.services.map((s) => s.name?.trim() || 'Service');
}

/**
 * A visit as the editing sheets need it: enough to address the visit endpoint and
 * to describe what is being edited, without either sheet re-resolving the rows.
 *
 * Null on an ordinary booking, which is the switch both sheets branch on — set
 * means "edit the visit through `/api/venue/visits/{id}/schedule`", absent means
 * "PATCH this one booking" exactly as before.
 */
export interface VisitEditTarget {
  groupBookingId: string;
  /** The visit's current span, HH:mm. */
  startHm: string;
  endHm: string;
  serviceCount: number;
  serviceNames: string[];
  /**
   * The visit's FIRST service. The endpoint notifies the guest once, against this
   * row, so it is also the id the app's own Notify follow-up must post to.
   */
  leadBookingId: string;
  /**
   * Every scheduled service, in order, as it stands. The schedule endpoint
   * takes a whole-visit `shift` or a per-service list (web #187); a length
   * change is the latter, so an editor needs each row's start and length to
   * say where every service goes and which one the extra time lands on.
   */
  services: VisitEditService[];
  /**
   * The services sit on more than one day. A length control then has no one
   * number to show, so the editors hide it; moves still shift every service.
   */
  spansDays: boolean;
}

/** One row of a visit as an editor holds it. */
export interface VisitEditService {
  bookingId: string;
  /** YYYY-MM-DD; absent when the rows came from a one-day feed. */
  date?: string | null;
  calendarId?: string | null;
  /** HH:mm */
  startHm: string;
  durationMinutes: number;
}

/** The editing view of a resolved visit. */
export function toVisitEditTarget(visit: AppointmentVisit, groupBookingId: string): VisitEditTarget {
  return {
    groupBookingId,
    startHm: visit.startHm,
    endHm: visit.endHm,
    serviceCount: visit.services.length,
    serviceNames: visitServiceNames(visit),
    leadBookingId: visit.services[0]!.id,
    services: visit.services.map((s) => ({
      bookingId: s.id,
      date: s.date,
      calendarId: s.calendarId,
      startHm: s.startHm,
      durationMinutes: s.durationMinutes,
    })),
    spansDays: visit.spansDays,
  };
}

/**
 * The editing view of ONE service of a visit (web #187: services move and
 * resize alone on the diary). `services` holds that row only, so a request
 * built from it names nothing else and an undo restores nothing else.
 */
export function visitEditTargetForService(
  visit: AppointmentVisit,
  groupBookingId: string,
  bookingId: string,
): VisitEditTarget {
  const whole = toVisitEditTarget(visit, groupBookingId);
  return {
    ...whole,
    services: whole.services.filter((s) => s.bookingId === bookingId),
  };
}

/**
 * The shortest a visit can be made by its length control: the whole visit less
 * whatever the LAST service can give up. Since web #187 a length change is that
 * service's alone (shortening one service no longer pulls the next forward), so
 * an earlier service is changed from its own booking, not by squeezing the
 * visit.
 */
export function visitLengthFloorMinutes(totalMinutes: number, services: readonly VisitEditService[]): number {
  const tail = services[services.length - 1];
  if (!tail) return MIN_CORE_DURATION_MINUTES;
  return Math.max(MIN_CORE_DURATION_MINUTES, totalMinutes - tail.durationMinutes + MIN_CORE_DURATION_MINUTES);
}
