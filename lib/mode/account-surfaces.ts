/**
 * Which accounts a signed-in person has, and therefore where the app sends
 * them after sign-in (owner's ask, 2026-09-10): check for a customer account,
 * a staff account and a superuser account; with more than one, ask, whether
 * they signed in with a password or a magic link.
 *
 * Pure. `useAppMode` feeds it and the root router branches on the answer. The
 * one property that matters more than the answer itself is that it settles
 * ONCE: a decided side is never swapped for another on its own (see
 * `useAppMode`'s note on the 2026-08-16 navigator crash), so every input the
 * decision depends on is waited for before a side is named.
 *
 * The web's own rule for the same question (`/auth/choose-destination`):
 * superusers go to `/super`, and a chooser is shown to anyone with more than
 * one surface and no stated preference. The app has no platform screens, so
 * its superuser option opens the web's `/super`.
 */

import type { AppModeChoice } from '@/lib/mode/app-mode-store';
import type { LoginDestination } from '@/lib/queries/useCustomerProfile';
import type { Role } from '@/lib/queries/useRole';

/** `choose` means the chooser screen; `resolving` means "do not route yet". */
export type AppMode = 'resolving' | 'choose' | AppModeChoice;

export interface AccountSurfaces {
  /** Venue staff (the staff/me probe answered). */
  staff: boolean;
  /** A customer somewhere (a confirmed customer, or staff who is also a guest of some venue). */
  customer: boolean;
  /** The platform superuser role on the session. */
  superuser: boolean;
}

export interface DecideModeInput {
  role: Role;
  /** The persisted choice has been read from disk. */
  storeRead: boolean;
  /** The side chosen earlier in this sign-in, if any. Cleared on sign-out. */
  storedChoice: AppModeChoice | null;
  /** The web preference is still being read (a failed read is not pending). */
  profilePending: boolean;
  destination: LoginDestination | null;
  /** The "also a customer" read is still in flight (only asked for staff). */
  customerPending: boolean;
  isAlsoCustomer: boolean;
  isSuperuser: boolean;
}

export interface DecideModeResult {
  mode: AppMode;
  /** A staff side exists to switch back to. */
  canSwitch: boolean;
  surfaces: AccountSurfaces;
}

export function decideMode(input: DecideModeInput): DecideModeResult {
  const {
    role,
    storeRead,
    storedChoice,
    profilePending,
    destination,
    customerPending,
    isAlsoCustomer,
    isSuperuser,
  } = input;

  // 1. A confirmed customer has no staff side. The only question left is a
  //    superuser who is also a customer, who is asked once per sign-in.
  if (role === 'customer') {
    const surfaces = { staff: false, customer: true, superuser: isSuperuser };
    if (!storeRead) return { mode: 'resolving', canSwitch: false, surfaces };
    if (isSuperuser && !storedChoice) return { mode: 'choose', canSwitch: false, surfaces };
    return { mode: 'customer', canSwitch: false, surfaces };
  }

  if (role === 'loading' || !storeRead) {
    return {
      mode: 'resolving',
      canSwitch: false,
      surfaces: { staff: false, customer: false, superuser: isSuperuser },
    };
  }

  // Staff, or `unknown` (the staff check could not answer; the caller's timeout
  // fails soft to staff, as the gate always has).
  const surfaces = { staff: true, customer: role === 'staff' && isAlsoCustomer, superuser: isSuperuser };

  // 2. A choice made earlier in this sign-in wins.
  if (storedChoice) return { mode: storedChoice, canSwitch: true, surfaces };

  // 3. Wait for what the decision depends on: the web preference and, for
  //    staff, whether they are also a customer. A failed read is not waited on.
  if (profilePending) return { mode: 'resolving', canSwitch: false, surfaces };
  if (role === 'staff' && customerPending) return { mode: 'resolving', canSwitch: false, surfaces };

  // 4. A stated preference is honoured without asking (set on the web, or in
  //    the app under Profile). "Ask me" and no preference mean ask.
  if (destination === 'account') return { mode: 'customer', canSwitch: true, surfaces };
  if (destination === 'dashboard') return { mode: 'staff', canSwitch: true, surfaces };

  // 5. More than one account: ask. Otherwise staff.
  if (surfaces.customer || surfaces.superuser) return { mode: 'choose', canSwitch: true, surfaces };
  return { mode: 'staff', canSwitch: true, surfaces };
}
