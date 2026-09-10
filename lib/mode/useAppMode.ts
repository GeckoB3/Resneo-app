import { useEffect, useState, useSyncExternalStore } from 'react';

import {
  getCachedAppMode,
  isAppModeLoaded,
  loadAppMode,
  rememberAppMode,
  subscribeAppMode,
  type AppModeChoice,
} from '@/lib/mode/app-mode-store';
import { usePlatformSuperuser } from '@/lib/auth/usePlatformSuperuser';
import { decideMode, type AccountSurfaces, type AppMode } from '@/lib/mode/account-surfaces';
import { useCustomerProfile } from '@/lib/queries/useCustomerProfile';
import { useCustomerVenueRelationships } from '@/lib/queries/useCustomerVenues';
import { useRole } from '@/lib/queries/useRole';

export type { AppMode } from '@/lib/mode/account-surfaces';

/**
 * Which face of the app to show, and whether we are ready to show either.
 *
 * **This is the value the root router branches on, and the reason it can only
 * ever settle once.** Expo Router's documented behaviour is that a `guard`
 * going from true to false removes every history entry for that screen; when
 * the screen is a navigator, that is the unmount this app has already died
 * from once. On 2026-08-16 a cold-start notification tap remounted the provider
 * tree about fifty times a second until the process ended. So the router must
 * not mount a side until it knows which side, and `resolving` is how it is told
 * to wait.
 *
 * The inputs, in the order they settle it:
 *
 * 1. **A confirmed customer has no choice to make.** `useRole()` returning
 *    `customer` means the staff check returned 401, so there is no staff side
 *    for them to be on.
 * 2. **An explicit switch wins for anyone else.** Someone who chose a side last
 *    time gets it back without being asked again.
 * 3. **Otherwise the web's own preference decides**, from
 *    `default_login_destination`. Reading the field the customer already set
 *    beats inventing an app-only twin that then disagrees with the web.
 *    With no preference and more than one account (staff who is also a
 *    customer, or a superuser), the answer is `choose` and the root router
 *    shows the chooser screen, once per sign-in, whichever way they signed in.
 * 4. **Failing all that, staff.** That is what every existing user of this app
 *    is, and it keeps the shipped experience unchanged for them.
 *
 * `unknown` roles are treated as staff by the caller after its timeout, exactly
 * as the staff gate has always done; this hook reports `resolving` for them and
 * lets the router own the fail-soft, because the timeout belongs with the thing
 * that can show a spinner.
 */
export function useAppMode(): {
  mode: AppMode;
  canSwitch: boolean;
  /** The accounts this person has, for the chooser. */
  surfaces: AccountSurfaces;
  choose: (m: AppModeChoice) => void;
} {
  const role = useRole();
  const profileQuery = useCustomerProfile();
  // "Also a customer somewhere": asked for staff only, since a confirmed
  // customer has nothing to choose and a superuser is read off the session.
  const customerQuery = useCustomerVenueRelationships(role === 'staff');
  const isSuperuser = usePlatformSuperuser();

  /*
    The stored choice is read once per run. It is mirrored in a module-level
    cache so a remount does not re-flash the loading screen, and this state
    exists only to re-render the first time the read lands.
  */
  const storedChoice = useSyncExternalStore(subscribeAppMode, getCachedAppMode, getCachedAppMode);
  const [storeRead, setStoreRead] = useState<boolean>(isAppModeLoaded);

  useEffect(() => {
    if (storeRead) return;
    let active = true;
    void loadAppMode().then(() => {
      // The value itself arrives through the external store; this only records
      // that the disk read has happened, which is what gates routing.
      if (!active) return;
      setStoreRead(true);
    });
    return () => {
      active = false;
    };
  }, [storeRead]);

  const choose = (next: AppModeChoice) => {
    // The store notifies every subscriber, including the router, so a switch
    // made on a settings screen actually moves the app.
    rememberAppMode(next);
  };

  /*
    The decision itself is pure (`account-surfaces.ts`). Two reads are waited
    on before a side is named: the web's preference, and for staff whether they
    are also somebody's customer. Waiting is what stops a person landing on one
    side and then being moved, which would be the navigator swap this whole
    design exists to avoid; the wait is bounded by the same round trips the
    staff check already costs, and all run in parallel. A FAILED read never
    blocks: it is treated as "no preference" / "not a customer" and the
    decision falls through to staff.
  */
  const decided = decideMode({
    role,
    storeRead,
    storedChoice,
    profilePending: profileQuery.isLoading && !profileQuery.isError,
    destination: profileQuery.data?.profile?.default_login_destination ?? null,
    customerPending: role === 'staff' && !customerQuery.isSuccess && !customerQuery.isError,
    isAlsoCustomer: (customerQuery.data?.venues?.length ?? 0) > 0,
    isSuperuser,
  });
  return { ...decided, choose };
}
