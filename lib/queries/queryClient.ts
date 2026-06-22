import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { ApiError } from '@/lib/api/client';

/**
 * Make React Query aware of REAL device connectivity via NetInfo (W1.7).
 *
 * Without this, RN has no `navigator.onLine`, so React Query assumes it's always
 * online: a mutation fired during signal loss is sent, stalls, and (with the
 * request timeout from W1.1) fails — the tap is effectively lost. With NetInfo
 * wired, React Query PAUSES mutations while offline and resumes them once
 * connectivity returns — an in-session write queue that pairs with the
 * OfflineBanner. We deliberately do NOT persist the mutation cache across app
 * restarts (that could double-submit a paused booking after a kill); resilience
 * is within-session only.
 */
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isConnected));
  }),
);

/**
 * Make React Query aware of foreground/background via AppState (W1.8).
 *
 * RN has no `window` focus events, so without this the app is treated as ALWAYS
 * focused: `refetchInterval` polls keep firing while backgrounded (battery/data
 * drain, and they race the Supabase background-token issue) and
 * `refetchOnWindowFocus` never fires on resume (stale data when the user returns).
 *
 * We treat only a true `background` as "blurred", NOT the transient `inactive`
 * (the biometric prompt, Control Centre / notification pull-down, app-switcher
 * peek) — so polling pauses only when genuinely backgrounded and stale queries
 * refetch exactly once on return, without churning on every inactive flicker.
 * Web keeps React Query's built-in visibility default.
 */
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) => {
      handleFocus(state !== 'background');
    });
    return () => subscription.remove();
  });
}

/**
 * Shared TanStack Query client.
 * Default staleTime reduces refetches when switching tabs during a busy shift.
 *
 * IMPORTANT: we deliberately do NOT sign the user out on a 401.
 *
 * A 401 from a `/api/venue/*` route means the venue backend rejected the
 * request — e.g. the route isn't Bearer-ready yet (the Phase 0.5 prerequisite),
 * the token wasn't recognised, or the user isn't staff. None of those mean the
 * Supabase auth *session* is invalid. A previous global "401 → signOut" handler
 * caused a login loop: right after sign-in the staff gate's
 * `GET /api/venue/staff/me` 401'd and instantly cleared a perfectly valid
 * session, bouncing the user back to the login screen.
 *
 * Who handles auth instead:
 * - Genuine session expiry → Supabase auto-refresh + `onAuthStateChange`
 *   (see AuthProvider) emit SIGNED_OUT and clear the session.
 * - "Valid session but not venue staff" → the `(app)` staff gate maps a
 *   staff/me 401 to a redirect to `/staff-required`.
 * - Per-screen 401/403 messaging → `getApiErrorMessage` in lib/api/client.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry transient failures once, but never auth/permission failures: a
      // 401/403 won't fix itself on a second try and just delays the staff
      // gate (staff/me) or the on-screen error.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});
