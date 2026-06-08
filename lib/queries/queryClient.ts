import { QueryClient } from '@tanstack/react-query';

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
      retry: 1,
    },
  },
});
