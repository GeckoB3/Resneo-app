/**
 * Which calendars offer a page service, at every venue in the collective (web
 * `CollectiveCalendarsSection.tsx`, 2026-10-28): the host's ticks, held as a diff.
 *
 * The ticks are intent (`add` and `remove`), never a picture of the whole set, so two venues saving
 * at once cannot silently undo each other. The service form sends the diff with its save as
 * `collective_calendars` (PATCH /api/venue/appointment-services); the engine is the only writer of
 * another venue's assignments.
 */
import { areaCopy } from '@/lib/collective-area/copy';
import type { CollectiveCalendarAssignment } from '@/lib/collective-area/model';

export interface CollectiveCalendarRef {
  calendar_id: string;
  venue_id: string;
}

/** What the host has changed but not saved. */
export interface CollectiveCalendarsDiff {
  add: CollectiveCalendarRef[];
  remove: CollectiveCalendarRef[];
}

export const EMPTY_CALENDARS_DIFF: CollectiveCalendarsDiff = { add: [], remove: [] };

const sameRef = (a: CollectiveCalendarRef, b: CollectiveCalendarRef) =>
  a.calendar_id === b.calendar_id && a.venue_id === b.venue_id;

export const isCalendarsDiffEmpty = (diff: CollectiveCalendarsDiff): boolean =>
  diff.add.length === 0 && diff.remove.length === 0;

/** Tick or untick one calendar: a change back to how it is saved drops the change. */
export function toggleCollectiveCalendar(
  diff: CollectiveCalendarsDiff,
  ref: CollectiveCalendarRef,
  savedOn: boolean,
  nowOn: boolean,
): CollectiveCalendarsDiff {
  const add = diff.add.filter((r) => !sameRef(r, ref));
  const remove = diff.remove.filter((r) => !sameRef(r, ref));
  if (nowOn && !savedOn) add.push(ref);
  if (!nowOn && savedOn) remove.push(ref);
  return { add, remove };
}

/** How one calendar's tick reads: ticked, and whether that is a change not saved yet. */
export function collectiveCalendarState(
  diff: CollectiveCalendarsDiff,
  ref: CollectiveCalendarRef,
  savedOn: boolean,
): { checked: boolean; pendingAdd: boolean; pendingRemove: boolean } {
  const pendingAdd = diff.add.some((r) => sameRef(r, ref));
  const pendingRemove = diff.remove.some((r) => sameRef(r, ref));
  return { checked: pendingAdd || (savedOn && !pendingRemove), pendingAdd, pendingRemove };
}

/**
 * The host backed out of the bookings question: the calendars it was about are ticked again,
 * since the refused save took none of them off. Every other change stays.
 */
export function keepCalendarsOffering(diff: CollectiveCalendarsDiff, calendarIds: readonly string[]): CollectiveCalendarsDiff {
  const ids = new Set(calendarIds);
  return { add: diff.add, remove: diff.remove.filter((r) => !ids.has(r.calendar_id)) };
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** "Last changed by Light 3, 28 Oct": worth naming for 30 days, after that it is just how it is. */
export function lastChangedLine(
  assignment: CollectiveCalendarAssignment | null | undefined,
  now: number = Date.now(),
): string | null {
  const changed = assignment?.last_changed;
  if (!changed?.at) return null;
  const when = Date.parse(changed.at);
  if (!Number.isFinite(when) || now - when > THIRTY_DAYS_MS) return null;
  const date = new Date(when).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return areaCopy('svc.cal.lastChanged', { venue: changed.venue_name, date });
}
