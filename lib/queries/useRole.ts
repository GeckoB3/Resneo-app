import { useMemo } from 'react';

import { ApiError } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useStaffMe } from '@/lib/queries/useStaffMe';

/**
 * Who the signed-in person is, as far as this app is concerned.
 *
 * - `loading`  — the answer is on its way.
 * - `staff`    — they have a staff profile at a venue.
 * - `customer` — they are signed in and have no staff profile.
 * - `unknown`  — we could not find out (no session, backend not configured, or
 *                the check failed for a reason that is not "not staff").
 */
export type Role = 'loading' | 'staff' | 'customer' | 'unknown';

/**
 * The role, derived from the staff profile check.
 *
 * **This is the same computation the staff gate has always done**, lifted out
 * of `app/(app)/_layout.tsx` so that the gate, push registration and the venue
 * bootstrap all read one answer instead of three. The only change of meaning is
 * the 401 branch: the gate called it `not_staff` and treated it as a dead end,
 * and it is in fact the positive identification of a customer.
 *
 * Two behaviours in `useStaffMe` are load-bearing here rather than incidental,
 * and this hook is only correct because of them. `keepPreviousData` carries the
 * profile across the ~hourly token refresh that re-keys the query, so a refresh
 * does not momentarily read as "no profile yet". And `staleTime` stops a newly
 * mounted observer, which is exactly what this hook adds several of, from
 * refetching and churning the answer.
 *
 * `unknown` is deliberately NOT collapsed into `customer`. A failed check and a
 * confirmed non-staff user are different facts, and callers want to treat them
 * differently: the gate lets an unknown user through after a timeout rather than
 * stranding them, while push registration declines to guess. Collapsing them
 * would make a venue API outage look like every staff member becoming a
 * customer.
 */
export function useRole(): Role {
  /*
    `useAccessToken()` rather than `useAuth()`, for two reasons.

    It is the same source `useStaffMe` reads, so the two cannot disagree about
    whether there is a session; deriving a role from one token while the query
    it depends on keys off another is a bug waiting for a race to expose it.

    And it keeps this module light. `AuthProvider` imports `registerDevice`,
    which imports `expo-notifications`, so importing `useAuth` here dragged the
    native push stack into every module that touches `useVenue`. That was not
    hypothetical: it crashed two test suites outright, in files that have
    nothing to do with either auth or push.
  */
  const accessToken = useAccessToken();
  const staffQuery = useStaffMe();

  return useMemo(() => {
    if (!accessToken) {
      return 'unknown';
    }

    // Venue API Bearer auth may not be configured yet — do not claim to know.
    if (!isBackendConfigured()) {
      return 'unknown';
    }

    // Once we have a profile, stay 'staff' through background refetches.
    if (staffQuery.data) {
      return 'staff';
    }

    if (staffQuery.isError) {
      if (staffQuery.error instanceof ApiError && staffQuery.error.status === 401) {
        return 'customer';
      }
      return 'unknown';
    }

    return 'loading';
  }, [accessToken, staffQuery.data, staffQuery.isError, staffQuery.error]);
}

/**
 * The `user_devices.audience` value for a role, or null when we should not
 * guess.
 *
 * Registering a device stamps it with the app it belongs to, and the server
 * fans out pushes by that stamp. Getting it wrong sends one venue's booking
 * alerts, which carry a client's name and service, to somebody who is not staff
 * there. So an unresolved role registers nothing at all rather than falling back
 * to a default.
 */
export function audienceForRole(role: Role): 'staff' | 'customer' | null {
  if (role === 'staff') return 'staff';
  if (role === 'customer') return 'customer';
  return null;
}
