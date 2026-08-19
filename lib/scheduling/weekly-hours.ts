/**
 * Shared rules for every weekly-hours editor in the app.
 *
 * The app has two of them — `OpeningHoursEditor` (venue business hours) and
 * `WorkingHoursEditor` (one calendar's working hours) — and both used to answer
 * "what does the Add button hand back?" on their own. They disagreed, and both
 * were wrong: one appended a hardcoded 09:00–17:00 (a duplicate of the range
 * before it on any default calendar), the other a hardcoded `previous.close`
 * to 21:00 with no room check at all.
 *
 * Web hit the same defect and fixed it once, in the shared editor these mirror:
 * `_reference/Resneo/src/components/scheduling/WeeklyHoursEditor.tsx`
 * (`canAddPeriod` / `nextPeriodAfter`). This is that logic, in minutes-since-
 * midnight because both app editors already work in minutes at the point they
 * call it.
 *
 * Minutes, not `Date`: a weekly template has no date attached, so there is no
 * timezone question to get wrong here.
 */

/** 23:59 — the last minute a period can end on. Matches web's `END_OF_DAY_MIN`. */
export const END_OF_DAY_MIN = 24 * 60 - 1;

/** One period of a day, in minutes since midnight. */
export type MinutePeriod = { start: number; end: number };

/** Shown in place of the Add control when {@link canAddPeriod} is false. */
export const NO_ROOM_FOR_PERIOD =
  'The last period runs to the end of the day, so there is no room for another one.';

/**
 * Is there room in the day for another period after the last one?
 *
 * Without this the Add button clamps against the end of the day and hands back
 * a period identical to the one before it. On a venue closing at 22:00 the next
 * period defaults to 23:00–23:59, and the one after that produced 23:00–23:59
 * again: two identical rows, both valid on their own, neither what anyone asked
 * for.
 *
 * An empty day can always take a period — that is the re-open case.
 */
export function canAddPeriod(periods: readonly MinutePeriod[]): boolean {
  const last = periods[periods.length - 1];
  if (!last) return true;
  return last.end + 60 <= END_OF_DAY_MIN;
}

/**
 * A starting point for a newly added period: an hour's gap after the previous
 * one closes, an hour long.
 *
 * Beats a fixed default, which is wrong for any day whose last period has moved
 * past it. Only call this when {@link canAddPeriod} is true, so the result
 * cannot collide with the period before it.
 */
export function nextPeriodAfter(
  previous: MinutePeriod | undefined,
  fallbackStart = 9 * 60,
): MinutePeriod {
  if (!previous) return { start: fallbackStart, end: 17 * 60 };
  const start = previous.end + 60;
  return { start, end: Math.min(start + 60, END_OF_DAY_MIN) };
}
