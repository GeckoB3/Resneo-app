/**
 * What a booking's own panel may claim about the guest's history.
 *
 * The server counts a visit the MOMENT a booking is seated — web
 * `src/lib/table-management/lifecycle.ts` increments `guests.visit_count` and
 * stamps `last_visit_date` with the day the transition happened (not the
 * booking's date) on any `* → Seated` that isn't a reopen, and decrements again
 * on an unseat. So from Arrived onwards the guest's totals INCLUDE the booking
 * you are looking at.
 *
 * Printed raw, the panel then claims history it created itself: a booking three
 * weeks away, marked Arrived by mistake, read "1 previous visit · Last visit
 * <today>" for a guest with no other bookings (device test, 2026-09-12). This
 * module takes this booking back out of the totals so both lines stay true, and
 * stays stable across the status change that caused it.
 *
 * The web's own booking panel sidesteps this by labelling the raw number
 * "N visits" (`src/components/booking/BookingDetailContent.tsx`) — true, but it
 * answers a different question from ours, which is what the app has always
 * asked: has this person been here before? Don't "restore parity" by putting
 * the self-counting number back.
 */

/**
 * Statuses in which the server has already counted this booking as a visit.
 * `Seated` is the trigger; `Completed` is only reachable through it, and a
 * reopen (`Completed → Seated`) deliberately does not count twice.
 *
 * A booking driven straight from `Booked` to `Completed` — no path in the app
 * does this — was never counted, so its visit would be subtracted here without
 * having been added. Under-reporting by one on a path that doesn't exist is the
 * safer failure.
 */
const VISIT_COUNTED_STATUSES = new Set(['Seated', 'Completed']);

export interface GuestVisitHistory {
  /** Visits BEFORE this one. 0 means the guest is new to the venue. */
  priorVisits: number;
  /**
   * The date of the last visit that isn't this booking, or null when there
   * isn't one to name — including the case where the stored stamp is this
   * booking's own attendance and the real previous date is no longer known.
   */
  lastVisitDate: string | null;
}

export function guestVisitHistory(args: {
  status: string | null | undefined;
  visitCount: number | null | undefined;
  lastVisitDate: string | null | undefined;
  /**
   * The statuses of the OTHER services in this visit, when the booking is one
   * service of several. The server counts a visit once, on whichever service is
   * seated first, so every row of that visit must report the same history:
   * without this, seating the 09:00 service left the 11:30 one still claiming
   * the visit it is part of as the guest's own past.
   */
  siblingStatuses?: readonly string[];
}): GuestVisitHistory {
  const counted =
    VISIT_COUNTED_STATUSES.has(args.status ?? '') ||
    (args.siblingStatuses?.some((s) => VISIT_COUNTED_STATUSES.has(s)) ?? false);
  const total = Math.max(0, args.visitCount ?? 0);
  const priorVisits = Math.max(0, total - (counted ? 1 : 0));

  // Once counted, the stamp is this booking's own attendance — the previous
  // date it overwrote is not sent to us, so we can name no date at all.
  const lastVisitDate = counted ? null : (args.lastVisitDate ?? null);

  return { priorVisits, lastVisitDate };
}

/**
 * One line of guest history for a booking panel: a date when we have one, the
 * count when the date is this booking's, and "First visit" when there is no
 * history behind this booking at all.
 */
export function visitHistoryCaption(
  history: GuestVisitHistory,
  formatDay: (iso: string) => string,
): string {
  if (history.priorVisits === 0 && !history.lastVisitDate) return 'First visit';
  if (history.lastVisitDate) return `Last visit ${formatDay(history.lastVisitDate)}`;
  return `${history.priorVisits} previous visit${history.priorVisits === 1 ? '' : 's'}`;
}

/** The same fact as a bare count, for the line under the guest's name. */
export function visitHistoryCountLabel(history: GuestVisitHistory): string {
  if (history.priorVisits === 0) return 'First visit';
  return `${history.priorVisits} previous visit${history.priorVisits === 1 ? '' : 's'}`;
}
