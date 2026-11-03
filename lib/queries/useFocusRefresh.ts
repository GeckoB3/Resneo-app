import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keep a customer screen current (web split-visit plan G27).
 *
 * The customer area used to refetch only when the app came back from the background with data
 * over 30 seconds old, or when the sign-in token rotated. A change made by staff, or by the
 * client on the web, stayed invisible while the app was open: seen live, the list stayed stale
 * across tab switches until a reload. React Navigation keeps a visited tab mounted, so mounting
 * is not a signal; focus is.
 *
 * `refresh` runs each time the screen comes back into focus (not on the first focus, when the
 * screen's queries are fetching anyway), and on pull-to-refresh through the returned
 * `refreshing` and `onRefresh`, which go straight onto a `RefreshControl`.
 *
 * `refreshing` is this hook's own state rather than a query's `isRefetching`, so the spinner shows
 * only for a pull the person made, not for every quiet refetch on focus.
 */
export function useFocusRefresh(refresh: () => Promise<unknown>): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  // The latest `refresh`, so the focus callback below can stay the same function: a new one
  // while focused would make `useFocusEffect` run it again on every render.
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void latest.current().catch(() => undefined);
    }, []),
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void latest
      .current()
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, []);

  return { refreshing, onRefresh };
}
