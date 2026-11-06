import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { calendarDateInTimeZone } from '@/lib/dates/venue-dates';

/** How often an open screen checks whether the venue's day has changed. */
const CHECK_INTERVAL_MS = 60_000;

function subscribe(onChange: () => void): () => void {
  const id = setInterval(onChange, CHECK_INTERVAL_MS);
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') onChange();
  });
  return () => {
    clearInterval(id);
    sub.remove();
  };
}

/**
 * Today (YYYY-MM-DD) in the venue's timezone, kept current while the app is
 * open: checked once a minute and whenever the app comes back to the front, and
 * re-rendering only when the date itself changes. A tablet left on the diary
 * overnight moves on to the new day, and a day picked yesterday is dropped
 * (`shared-diary-date.ts`).
 */
export function useVenueToday(timeZone: string): string {
  const getSnapshot = useCallback(() => calendarDateInTimeZone(new Date(), timeZone), [timeZone]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
