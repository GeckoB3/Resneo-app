/**
 * The route params that open the booking form from the diary.
 *
 * One builder for both ways in — the "+" button and a tapped slot, each in its
 * New-booking and Walk-in flavours — because they drifted: the FAB's New
 * booking sent no date at all, so pressing + while looking at a Saturday three
 * weeks out opened the form on TODAY and the day had to be chosen again, while
 * Walk-in on the same sheet carried the day correctly (device test,
 * 2026-09-12). The day on screen is the day you mean, whichever button you
 * press.
 *
 * Collective and resource params are the caller's to add: they depend on which
 * calendar was tapped, not on when.
 */

export interface NewBookingParams {
  date: string;
  practitionerId?: string;
  time?: string;
  intent?: 'walk-in';
}

export function newBookingParams(args: {
  /** The diary's anchor date (YYYY-MM-DD) — always sent. */
  date: string;
  /** The tapped slot, or null when the FAB opened the sheet. */
  slot: { practitionerId: string; time: string } | null;
  /** Used only when there is no slot: a walk-in starts "now". */
  fallbackTime?: string | null;
  intent?: 'walk-in';
}): NewBookingParams {
  const { date, slot, fallbackTime, intent } = args;
  return {
    date,
    ...(slot ? { practitionerId: slot.practitionerId, time: slot.time } : {}),
    ...(!slot && fallbackTime ? { time: fallbackTime } : {}),
    ...(intent ? { intent } : {}),
  };
}
