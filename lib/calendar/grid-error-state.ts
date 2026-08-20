/**
 * What to show when the calendar-grid query is in an error state (R21-6).
 *
 * The calendar polls `/api/venue/calendar-grid` every 60 seconds, and the screen
 * used to check `isError` before rendering data — so a single failed poll replaced
 * a working, fully-loaded calendar with a full-screen "Try again". The data that
 * had just been on screen was still held and still correct; the screen threw it
 * away because one background refetch did not land.
 *
 * That was tolerable while the route always answered 200. Web is about to wrap
 * `/api/venue/calendar-grid` in `withScheduleFailClosed`, which makes a failed
 * schedule read a 503 — a deliberately temporary answer, and exactly the kind of
 * blip a 60-second poll will catch. Web is holding that change until this lands
 * (see Docs/R21_WEB_HANDOVER.md W1), because the app is its only consumer.
 *
 * The distinction is not simply "do we have data": with `placeholderData:
 * keepPreviousData` the grid can be holding the PREVIOUS range while a fetch for
 * the newly-anchored one is in flight. Degrading to a banner there would present
 * one day's bookings under another day's date, which is worse than admitting the
 * failure — the same trade web made server-side, where refusing to answer beats
 * answering wrongly.
 *
 * Pure + unit-tested so the rule cannot drift back into an `isError` check at the
 * render site. Sibling of {@link resolveDayLoadState}, which handles the other
 * half of the same placeholder race.
 */

export type GridErrorStateInput = {
  /** React Query `isError` for the grid query. */
  isError: boolean;
  /** Whether the query currently holds anything to render. */
  hasData: boolean;
  /**
   * React Query `isPlaceholderData` — true while the grid is showing a previous
   * range because the query re-keyed (a date step) and the new fetch is unsettled.
   */
  isPlaceholderData: boolean;
};

export type GridErrorState = {
  /** Replace the calendar with a full-screen error and a retry. */
  showErrorScreen: boolean;
  /**
   * Keep the calendar on screen and warn above it that what is shown may no
   * longer be current. Never true at the same time as {@link showErrorScreen}.
   */
  showStaleBanner: boolean;
};

export function resolveGridErrorState({
  isError,
  hasData,
  isPlaceholderData,
}: GridErrorStateInput): GridErrorState {
  if (!isError) return { showErrorScreen: false, showStaleBanner: false };

  // Real data for the range being viewed: the failure is a later refetch, and
  // everything on screen loaded successfully. Keep it and say it may be stale.
  const canDegrade = hasData && !isPlaceholderData;

  return { showErrorScreen: !canDegrade, showStaleBanner: canDegrade };
}
