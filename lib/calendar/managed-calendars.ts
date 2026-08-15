/**
 * Which calendars a staff member may put a booking ON.
 *
 * The server gained this gate in web's C8 audit fix
 * (`venue/bookings/[id]/route.ts`, `requireManagedCalendarAccess`): an own-venue
 * non-admin PATCHing `practitioner_id` is refused unless the target calendar is
 * assigned to their account. Before it, a non-admin could move any booking onto
 * any colleague's calendar.
 *
 * The app walks straight into that gate, because
 * {@link usePractitioners} asks for `roster=1` — which is exactly the flag that
 * DISABLES the server's managed-calendar narrowing:
 *
 * ```ts
 * // _reference/Resneo/src/app/api/venue/practitioners/route.ts:326
 * if (staff.role !== 'admin' && !roster) { …filter to managed calendars… }
 * ```
 *
 * So every column renders for everyone, and the refusal only arrives after the
 * gesture has completed and the bar has animated. This module lets the app
 * answer the same question up front, with the same copy.
 *
 * **It mirrors the server; it does not replace it.** The server is the authority
 * — `linked_calendar_ids` can be stale in cache, and only the server sees the
 * junction table. A 403 must still be surfaced wherever a move is sent.
 *
 * @see Docs/APP_GAP_REPORT_R16_WEB_DELTA.md (R16-1)
 */

import type { StaffRole } from '@/types/staff';

/**
 * Web's copy, verbatim (`src/lib/venue-auth.ts:24`), so the app's pre-flight
 * refusal and the server's 403 read identically. Staff who hit both should not
 * be told two different things about one rule.
 */
export const OUTSIDE_ASSIGNED_CALENDARS_ERROR =
  'You can only manage calendars assigned to your account.';

/** Web's `NO_ASSIGNED_CALENDARS_ERROR` (`src/lib/venue-auth.ts:22`). */
export const NO_ASSIGNED_CALENDARS_ERROR =
  'No calendars are assigned to your account. Ask an admin to assign at least one calendar.';

/** The move-specific message web passes at the C8 call site. */
export const CANNOT_MOVE_TO_CALENDAR_ERROR =
  'You can only move bookings onto calendars assigned to your account.';

export interface CalendarScope {
  role: StaffRole | undefined;
  /** `staff.linked_calendar_ids` from GET /api/venue/staff/me. */
  managedCalendarIds: readonly string[] | undefined;
}

/**
 * True when this staff member may place a booking on `calendarId`.
 *
 * Mirrors `requireManagedCalendarAccess` exactly, including the parts that look
 * like edge cases and are not:
 *
 * - **Admins pass everything.** The server checks the role before the id.
 * - **A missing target id fails closed**, matching the server's first line
 *   (`if (!calendarId) return { ok: false }`). A move with no destination is not
 *   a permissive case.
 * - **An empty managed list fails**, because the server's
 *   `requireManagedCalendarIds` returns `NO_ASSIGNED_CALENDARS_ERROR` rather
 *   than an empty allow-all.
 *
 * The one thing it does NOT mirror is the role being unknown: while
 * `useStaffMe` is still loading, `role` is `undefined` and this returns `true`.
 * Refusing on a not-yet-loaded profile would block admins for the first few
 * hundred milliseconds after launch, and the server is behind every path this
 * guards — so an optimistic answer costs a 403 at worst, where a pessimistic one
 * costs a broken gesture for everybody.
 */
export function canStaffUseCalendar(
  scope: CalendarScope,
  calendarId: string | null | undefined,
): boolean {
  if (scope.role === undefined) return true;
  if (scope.role === 'admin') return true;
  if (!calendarId) return false;
  return (scope.managedCalendarIds ?? []).includes(calendarId);
}

/**
 * The calendars this staff member may move a booking onto, out of `calendars`.
 *
 * Used to narrow a picker rather than to refuse a gesture, so an unloaded
 * profile leaves the list untouched for the same reason as above.
 */
export function filterToUsableCalendars<T extends { id: string }>(
  scope: CalendarScope,
  calendars: readonly T[],
): T[] {
  if (scope.role === undefined || scope.role === 'admin') return [...calendars];
  const managed = new Set(scope.managedCalendarIds ?? []);
  return calendars.filter((c) => managed.has(c.id));
}
