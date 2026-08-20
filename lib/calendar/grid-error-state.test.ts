/**
 * R21-6 — the calendar must not throw away a working day over one failed poll,
 * and must not present a stale day as the current one either.
 */
import { resolveGridErrorState } from '@/lib/calendar/grid-error-state';

describe('resolveGridErrorState', () => {
  it('shows neither state while the query is healthy', () => {
    expect(
      resolveGridErrorState({ isError: false, hasData: true, isPlaceholderData: false }),
    ).toEqual({ showErrorScreen: false, showStaleBanner: false });
  });

  it('degrades to a banner when a refetch fails over data that loaded fine', () => {
    // The 60-second poll case. Everything on screen is real and for this range.
    expect(
      resolveGridErrorState({ isError: true, hasData: true, isPlaceholderData: false }),
    ).toEqual({ showErrorScreen: false, showStaleBanner: true });
  });

  it('shows the error screen on a cold load with nothing to fall back on', () => {
    expect(
      resolveGridErrorState({ isError: true, hasData: false, isPlaceholderData: false }),
    ).toEqual({ showErrorScreen: true, showStaleBanner: false });
  });

  it('shows the error screen rather than passing off another range as this one', () => {
    // keepPreviousData is holding the PREVIOUS day while the newly-anchored one
    // fails. A banner here would put yesterday's bookings under today's date.
    expect(
      resolveGridErrorState({ isError: true, hasData: true, isPlaceholderData: true }),
    ).toEqual({ showErrorScreen: true, showStaleBanner: false });
  });

  it('never asks for both at once', () => {
    for (const hasData of [true, false]) {
      for (const isPlaceholderData of [true, false]) {
        const state = resolveGridErrorState({ isError: true, hasData, isPlaceholderData });
        expect(state.showErrorScreen && state.showStaleBanner).toBe(false);
        // An error always produces exactly one of the two, so a failure can
        // never be silent.
        expect(state.showErrorScreen || state.showStaleBanner).toBe(true);
      }
    }
  });
});
