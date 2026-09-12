/**
 * "This calendar is dropping a service that already has bookings."
 *
 * Taking a service off a calendar stopped being a refusal on 2026-09-12 (web
 * #194). Both service-link routes — `PATCH /api/venue/appointment-services`
 * (via `practitioner_ids`) and `PUT /api/venue/practitioner-services` — now
 * answer 409 with the upcoming bookings that would be left behind, and honour
 * `?acknowledge_affected_bookings=true` on the retry, joining the same family as
 * the opening-hours, closures and amended-hours confirmations the app already
 * threads (`isRequiresConfirmationBody`).
 *
 * The bookings themselves are never touched: the calendar simply stops offering
 * the service to NEW guests. The operator either leaves them exactly where they
 * are, or moves a group to another calendar that already offers the service.
 *
 * The app's mirror of the web's client-safe wire module — keep the shapes in
 * step with it.
 * @see C:\Resneo\src\lib\venue\service-removal-bookings.ts
 * @see C:\Resneo\src\lib\venue\service-calendar-removal.ts (serviceRemovalConfirmationPayload)
 */
import { formatShortDay } from '@/lib/dates/venue-dates';

/** One upcoming booking left on a calendar that is dropping its service. */
export interface ServiceRemovalAffectedBooking {
  id: string;
  /** `service_items.id` (unified scheduling) or `appointment_services.id` (legacy). */
  service_id: string;
  service_name: string;
  /** Calendar column the booking sits on. */
  calendar_id: string;
  calendar_name: string;
  booking_date: string;
  /** HH:mm */
  booking_time: string;
  /** HH:mm, or null when the row carries no resolvable end. */
  end_time: string | null;
  guest_name: string;
  party_size: number;
  status: string;
}

/** The 409 body from a service-link save that would leave upcoming bookings behind. */
export interface ServiceRemovalConfirmation {
  message: string;
  bookings: ServiceRemovalAffectedBooking[];
  /** Exact number affected, which may exceed `bookings.length` (the server caps the sample at 200). */
  total: number;
  truncated: boolean;
}

/** One booking the operator chose to move, and where to. */
export interface ServiceRemovalMove {
  bookingId: string;
  targetCalendarId: string;
}

export interface ServiceRemovalMoveFailure {
  bookingId: string;
  label: string;
  reason: string;
}

/**
 * Reads a 409 body from either service-link route. Returns null for any other
 * failure, which the caller must surface as a plain error — the routes still
 * answer ordinary 409s (a duplicate name, a plan limit) that mean "no".
 */
export function parseServiceRemovalConfirmation(
  payload: unknown,
): ServiceRemovalConfirmation | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as {
    requires_confirmation?: unknown;
    message?: unknown;
    affected_bookings?: unknown;
    affected_total?: unknown;
    affected_truncated?: unknown;
  };
  if (body.requires_confirmation !== true || !Array.isArray(body.affected_bookings)) return null;
  const bookings = body.affected_bookings as ServiceRemovalAffectedBooking[];
  return {
    message:
      typeof body.message === 'string' && body.message.trim() !== ''
        ? body.message
        : 'Some upcoming bookings are already booked for this service on this calendar.',
    bookings,
    total: typeof body.affected_total === 'number' ? body.affected_total : bookings.length,
    truncated: body.affected_truncated === true,
  };
}

/** Affected bookings for one service on one calendar — the unit the operator decides about. */
export interface ServiceRemovalGroup {
  key: string;
  serviceId: string;
  serviceName: string;
  calendarId: string;
  calendarName: string;
  bookings: ServiceRemovalAffectedBooking[];
}

/** Groups by calendar × service, keeping the server's date/time order within each group. */
export function groupServiceRemovalBookings(
  bookings: ServiceRemovalAffectedBooking[],
): ServiceRemovalGroup[] {
  const groups = new Map<string, ServiceRemovalGroup>();
  for (const booking of bookings) {
    const key = `${booking.calendar_id}::${booking.service_id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.bookings.push(booking);
      continue;
    }
    groups.set(key, {
      key,
      serviceId: booking.service_id,
      serviceName: booking.service_name,
      calendarId: booking.calendar_id,
      calendarName: booking.calendar_name,
      bookings: [booking],
    });
  }
  return [...groups.values()];
}

/**
 * Identity of the current list. When the caller drops the bookings that have
 * already moved, this changes and the panel's per-group choices reset with it —
 * which beats resetting from an effect.
 */
export function serviceRemovalListKey(groups: ServiceRemovalGroup[]): string {
  return groups.map((g) => `${g.key}:${g.bookings.length}`).join('|');
}

/** Every booking in a group whose target is set, flattened into the move list. */
export function serviceRemovalMoves(
  groups: ServiceRemovalGroup[],
  targetsByGroupKey: Record<string, string>,
): ServiceRemovalMove[] {
  return groups.flatMap((group) => {
    const target = targetsByGroupKey[group.key];
    if (!target) return [];
    return group.bookings.map((booking) => ({ bookingId: booking.id, targetCalendarId: target }));
  });
}

/** "Mon 3 Aug, 10:00" — how a failure names the booking it could not move. */
export function affectedBookingLabel(booking: ServiceRemovalAffectedBooking): string {
  return `${booking.guest_name}, ${formatShortDay(booking.booking_date)}, ${booking.booking_time}`;
}

/** "Mon 3 Aug, 10:00 to 11:00" — the row's own line. */
export function affectedBookingWhen(booking: ServiceRemovalAffectedBooking): string {
  const day = formatShortDay(booking.booking_date);
  return booking.end_time
    ? `${day}, ${booking.booking_time} to ${booking.end_time}`
    : `${day}, ${booking.booking_time}`;
}

/**
 * The PATCH input for moving one affected booking, as
 * {@link useRescheduleBookingById} takes it.
 *
 * Same date, same time, same length: only the column changes, so the guest is
 * not emailed and nothing is cancelled. The END TIME goes explicitly — without
 * it `/api/venue/bookings/[id]` re-derives the end from the service's default
 * duration and quietly resets a custom length. The reschedule hook sends
 * `allow_outside_hours` and `allow_during_breaks` (the booking already exists at
 * this time, so the target's hours and breaks are not a reason to refuse it) but
 * withholds `allow_manual_overlap` whenever a calendar is named, so a real clash
 * on the target is still reported rather than forced through.
 */
export function serviceRemovalMoveInput(
  booking: ServiceRemovalAffectedBooking,
  targetCalendarId: string,
): {
  bookingId: string;
  date: string;
  time: string;
  endTime?: string;
  practitionerId: string;
  skipGuestNotification: true;
} {
  return {
    bookingId: booking.id,
    date: booking.booking_date,
    time: booking.booking_time,
    ...(booking.end_time ? { endTime: `${booking.end_time}:00` } : {}),
    practitionerId: targetCalendarId,
    // The route only emails on a date or time change and this move changes
    // neither; said out loud so a future change to that rule cannot surprise a guest.
    skipGuestNotification: true,
  };
}

/**
 * Moves each chosen booking onto its target calendar, ONE AT A TIME so a single
 * clash cannot take the rest down with it. Mirrors the web's `moveAffectedBookings`.
 */
export async function runServiceRemovalMoves(
  moves: ServiceRemovalMove[],
  bookings: ServiceRemovalAffectedBooking[],
  move: (booking: ServiceRemovalAffectedBooking, targetCalendarId: string) => Promise<unknown>,
): Promise<{ movedIds: Set<string>; failures: ServiceRemovalMoveFailure[] }> {
  const byId = new Map(bookings.map((b) => [b.id, b] as const));
  const movedIds = new Set<string>();
  const failures: ServiceRemovalMoveFailure[] = [];

  for (const entry of moves) {
    const booking = byId.get(entry.bookingId);
    if (!booking) continue;
    try {
      await move(booking, entry.targetCalendarId);
      movedIds.add(booking.id);
    } catch (e) {
      failures.push({
        bookingId: booking.id,
        label: affectedBookingLabel(booking),
        reason: e instanceof Error && e.message ? e.message : 'This booking could not be moved.',
      });
    }
  }

  return { movedIds, failures };
}

/**
 * The same confirmation without the bookings that did move, so a second attempt
 * cannot move them twice. `total` comes down with them.
 */
export function withoutMovedBookings(
  confirmation: ServiceRemovalConfirmation,
  movedIds: Set<string>,
): ServiceRemovalConfirmation {
  if (movedIds.size === 0) return confirmation;
  return {
    ...confirmation,
    bookings: confirmation.bookings.filter((b) => !movedIds.has(b.id)),
    total: Math.max(confirmation.total - movedIds.size, 0),
  };
}

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * The calendars the confirmation was about, and the services it was about.
 *
 * What a CANCELLED confirmation has to put back. The 409 writes nothing, so a
 * form still showing the calendar unticked tells the owner a removal happened
 * when it did not — the web hit exactly this and now restores the ticks the
 * question was about, leaving every other edit in the form alone
 * (`Docs/R35_WEB_HANDOVER.md`, their reply of 2026-09-12).
 *
 * Only what the confirmation NAMED is restored: a calendar unticked with no
 * bookings on it was never in question and stays unticked.
 */
export function affectedCalendarIds(confirmation: ServiceRemovalConfirmation): string[] {
  return uniqueIds(confirmation.bookings.map((b) => b.calendar_id));
}

export function affectedServiceIds(confirmation: ServiceRemovalConfirmation): string[] {
  return uniqueIds(confirmation.bookings.map((b) => b.service_id));
}

/** "Move 2 bookings and save" / "Save and leave these bookings here". */
export function serviceRemovalPrimaryLabel(moveCount: number): string {
  return moveCount > 0
    ? `Move ${moveCount} booking${moveCount === 1 ? '' : 's'} and save`
    : 'Save and leave these bookings here';
}
