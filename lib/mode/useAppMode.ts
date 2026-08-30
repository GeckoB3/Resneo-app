import { useEffect, useState, useSyncExternalStore } from 'react';

import {
  getCachedAppMode,
  isAppModeLoaded,
  loadAppMode,
  rememberAppMode,
  subscribeAppMode,
  type AppModeChoice,
} from '@/lib/mode/app-mode-store';
import { useCustomerProfile } from '@/lib/queries/useCustomerProfile';
import { useRole } from '@/lib/queries/useRole';

/**
 * `resolving` means "do not route yet". It is not a third destination.
 */
export type AppMode = 'resolving' | AppModeChoice;

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
 * 4. **Failing all that, staff.** That is what every existing user of this app
 *    is, and it keeps the shipped experience unchanged for them.
 *
 * `unknown` roles are treated as staff by the caller after its timeout, exactly
 * as the staff gate has always done; this hook reports `resolving` for them and
 * lets the router own the fail-soft, because the timeout belongs with the thing
 * that can show a spinner.
 */
export function useAppMode(): { mode: AppMode; canSwitch: boolean; choose: (m: AppModeChoice) => void } {
  const role = useRole();
  const profileQuery = useCustomerProfile();

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

  // 1. A confirmed customer. Nothing else is consulted, and notably we do NOT
  //    wait on the profile read: there is no decision left to inform.
  if (role === 'customer') {
    return { mode: 'customer', canSwitch: false, choose };
  }

  if (role === 'loading' || !storeRead) {
    return { mode: 'resolving', canSwitch: false, choose };
  }

  // 2. An explicit switch.
  if (storedChoice) {
    return { mode: storedChoice, canSwitch: true, choose };
  }

  /*
    3. The web's preference. Waiting for it is what stops a staff-and-customer
       person landing on staff and then being moved, which would be the
       navigator swap this whole design exists to avoid. The wait is bounded by
       the same round trip the staff check already costs, and both run in
       parallel.

       A FAILED profile read does not block: it falls through to staff below.
       Refusing to route because a preference could not be read would strand
       someone over a question whose answer is a default.
  */
  if (profileQuery.isLoading && !profileQuery.isError) {
    return { mode: 'resolving', canSwitch: false, choose };
  }

  const destination = profileQuery.data?.profile?.default_login_destination ?? null;
  if (destination === 'account') {
    return { mode: 'customer', canSwitch: true, choose };
  }

  // 4. Staff, including 'dashboard', 'ask' and an unreadable profile.
  return { mode: 'staff', canSwitch: true, choose };
}
