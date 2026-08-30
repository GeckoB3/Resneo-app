import { useEffect, useMemo, useSyncExternalStore } from 'react';

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
 * The role this session has already settled on, held for the process.
 *
 * **Without this, every customer is thrown back to the loading screen once an
 * hour.** `useStaffMe` is keyed on the access token, which Supabase rotates
 * roughly hourly, and a new key means no cached result. Staff survive that
 * because `keepPreviousData` carries their profile across the re-key. A
 * customer has no profile to carry: their settled answer is an ERROR, a 401,
 * and keepPreviousData does not carry errors. So the query returns to pending,
 * the role returns to `loading`, and the router unmounts the customer navigator
 * and mounts the loading screen in its place.
 *
 * That is precisely the failure this phase exists to prevent, arriving on a
 * timer rather than by chance. A role does not change during a session, so
 * latching the first resolved answer is not merely a patch for it, it is the
 * truth: nobody stops being staff because their token was refreshed.
 *
 * Cleared when the session ends, below, so the next person on a shared device
 * inherits nothing.
 */
let latchedRole: Extract<Role, 'staff' | 'customer'> | null = null;
const latchListeners = new Set<() => void>();

function getLatchedRole(): Extract<Role, 'staff' | 'customer'> | null {
  return latchedRole;
}

function subscribeLatchedRole(listener: () => void): () => void {
  latchListeners.add(listener);
  return () => {
    latchListeners.delete(listener);
  };
}

/**
 * Settle the role for this session. WRITE ONCE.
 *
 * The no-op on an already-latched value is the invariant, not an optimisation.
 * An earlier version overwrote on every resolved observation, which quietly
 * defeated the whole mechanism: the latch could be moved from `staff` to
 * `customer` mid-session by one unlucky refetch, and moving it is a mode
 * change, and a mode change is a navigator unmount. Once settled, only signing
 * out clears it.
 */
function setLatchedRole(role: Extract<Role, 'staff' | 'customer'>): void {
  if (latchedRole !== null) return;
  latchedRole = role;
  latchListeners.forEach((l) => l());
}

/** Forget the settled role. Called when the access token disappears. */
export function clearLatchedRole(): void {
  if (latchedRole === null) return;
  latchedRole = null;
  latchListeners.forEach((l) => l());
}

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
  /*
    Read through `useSyncExternalStore` rather than by touching the module
    variable during render. The latch is shared mutable state outside React, and
    that is exactly what this hook is for: it subscribes, so a latch set by one
    consumer re-renders the others, and the read is consistent within a render.
  */
  const latched = useSyncExternalStore(subscribeLatchedRole, getLatchedRole, getLatchedRole);

  /** What the staff check says right now, computed with no side effects. */
  const observed = useMemo<Role>(() => {
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
      /*
        `unknown` is the absence of an answer rather than an answer, and the
        effect below refuses to latch it. Because the latch is write-once, doing
        so would be permanent: a staff member whose check hit a 500 on launch
        would be stuck as `unknown` for the life of the process, however many
        successful checks followed.
      */
      return 'unknown';
    }

    return 'loading';
  }, [accessToken, staffQuery.data, staffQuery.isError, staffQuery.error]);

  /*
    Latching is a side effect, so it happens in an effect. Doing it during
    render, which an earlier version did, means a render React discards can
    still have written a permanent answer.

    Only the two RESOLVED roles are latched. `unknown` is the absence of an
    answer rather than an answer, and making one failed check permanent would
    leave a staff member who hit a 500 on launch unrecognised for the rest of
    the process, however many successful checks followed.
  */
  useEffect(() => {
    if (!accessToken) {
      clearLatchedRole();
      return;
    }
    if (observed === 'staff' || observed === 'customer') {
      setLatchedRole(observed);
    }
  }, [accessToken, observed]);

  /*
    The latch wins. It is what keeps a customer from being thrown back to the
    loading screen every time the access token rotates: their settled answer is
    a 401, `keepPreviousData` carries data but not errors, so without this the
    query returns to pending and the router unmounts their navigator.

    Signing out is handled before the latch is consulted, so a stale answer
    cannot outlive the session that produced it.
  */
  if (!accessToken) return 'unknown';
  return latched ?? observed;
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
