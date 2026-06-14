import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/client';

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
