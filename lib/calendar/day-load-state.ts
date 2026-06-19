/**
 * Load/closed state for the single-calendar day view.
 *
 * The calendar-grid query keys on the visible date range, so stepping the day
 * starts a fresh fetch. With `placeholderData: keepPreviousData` the prior
 * range stays on screen while that fetch is in flight — but the prior range
 * does NOT contain the newly-anchored date, so the resolved `day` is null and
 * React Query reports `isLoading: false` (status stays `success` on the kept
 * placeholder). Reading "closed" straight off that null `day` made the
 * "Not scheduled to work this day" banner flash on every day navigation.
 *
 * This helper makes the distinction explicit: a null `day` while fetching means
 * "still loading" (show a spinner), and "closed" is asserted ONLY from a
 * settled, non-placeholder record that actually covers the anchor date. Pure +
 * unit-tested so the race can't silently regress.
 */
import type { CalendarGridDay } from '@/types/calendar-grid';

export type DayLoadStateInput = {
  /**
   * The grid day resolved for the viewed calendar + anchor date, or null when
   * the data currently held does not (yet) contain that date.
   */
  day: CalendarGridDay | null;
  /** React Query `isFetching` for the grid query. */
  isFetching: boolean;
  /** React Query `isPlaceholderData` for the grid query (keepPreviousData). */
  isPlaceholderData: boolean;
};

export type DayLoadState = {
  /**
   * Show a spinner: the grid is fetching data that does not yet cover the
   * anchor date (e.g. stepping the day re-keys the query and keepPreviousData
   * holds the prior range until the fetch lands).
   */
  isLoading: boolean;
  /**
   * Show the closed-day banner: a settled grid record exists for the date and
   * it has no working hours and no bookings. Never true while loading.
   */
  isClosed: boolean;
};

/**
 * Decide the day view's load/closed state from the resolved `day` plus the
 * grid query's fetch flags. See the file header for why the placeholder race
 * means a null `day` must read as loading, not closed.
 */
export function resolveDayLoadState({
  day,
  isFetching,
  isPlaceholderData,
}: DayLoadStateInput): DayLoadState {
  // No record for this date yet + a fetch in flight → the data that covers the
  // anchor is still on its way. (A null `day` with no fetch is a non-loading
  // edge case — e.g. a stale selected id — and is left to render an empty grid,
  // not a perpetual spinner.)
  const isLoading = day === null && isFetching;

  // Only a real, settled record can be "closed". While placeholder data is on
  // screen we are mid-fetch, so defer the verdict until the live data lands.
  const isClosed =
    day !== null &&
    !isPlaceholderData &&
    day.workingHours.length === 0 &&
    day.bookings.length === 0;

  return { isLoading, isClosed };
}
