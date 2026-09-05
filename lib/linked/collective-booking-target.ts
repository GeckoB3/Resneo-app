import type { StaffCollectiveSummary } from '@/types/linked-venues';

/** Where a new booking goes when a column books through the collective. */
export interface CollectiveBookingTarget {
  /** The collective id, sent as `owner_venue_id` (and `venue_id` on the visit and group creates). */
  id: string;
  name: string;
}

/**
 * Where a new booking for `calendarId` on `columnVenueId` goes: the live
 * collective the caller's venue books for, or null for the column's own venue.
 *
 * The web diary's `collectiveTargetFor` rule (2026-09-04): the column's venue
 * must be a member, and the calendar (when the tap names one) must be one the
 * combined catalogue offers. A partner outside the collective, or a calendar
 * with no combined offering (a resource column, say), keeps the per-venue form
 * it had. Pass no calendar for the toolbar's New and Walk-in, which open the
 * form over the whole collective.
 */
export function collectiveBookingTargetFor(
  collective: StaffCollectiveSummary | null | undefined,
  columnVenueId: string | null | undefined,
  calendarId?: string | null,
): CollectiveBookingTarget | null {
  if (!collective || !columnVenueId) return null;
  if (!collective.member_venue_ids.includes(columnVenueId)) return null;
  if (calendarId && !collective.calendar_ids.includes(calendarId)) return null;
  return { id: collective.id, name: collective.name };
}

/**
 * The `/booking/new` params that send the form to the collective, or nothing
 * when the venue books for itself, so the own-venue path is untouched.
 */
export function collectiveBookingParams(
  target: CollectiveBookingTarget | null,
): { ownerVenueId: string; ownerVenueName: string } | Record<string, never> {
  return target ? { ownerVenueId: target.id, ownerVenueName: target.name } : {};
}
