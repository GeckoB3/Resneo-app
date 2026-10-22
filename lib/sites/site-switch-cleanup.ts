import { clearTerminalLocationCache } from '@/lib/payments/connection-token';
import { queryClient, resetQueriesForSiteChange } from '@/lib/queries/queryClient';
import { clearRebookBootstrap } from '@/lib/rebook-bootstrap';
import { onBeforeSiteChange, onSiteChange } from '@/lib/sites/active-site';

/**
 * What a site switch lets go of outside React (web roles plan §6.2c,
 * Docs/user-roles-and-multi-site-plan.md). The rest is done where it lives:
 *
 *   - the card reader disconnects and the SDK drops its cached token (`TerminalProvider`);
 *   - the linked venue is cleared (`LinkedVenueProvider`);
 *   - Tap to Pay's terms are asked about again for the new site (`TapToPayProvider`);
 *   - the reader hooks drop their reader (`lib/payments/terminal.ts`, `bluetoothReader.ts`);
 *   - the per-site SecureStore keys carry the site (`siteScopedKey`), so nothing needs clearing;
 *   - `apiFetch` drops any answer that set off before the switch.
 *
 * Registered once at launch (`app/_layout.tsx`).
 */

let registered = false;

/** Query cache last: by then the contexts its queries read have let go. */
const QUERY_RESET_ORDER = 100;

export function registerSiteSwitchCleanup(): void {
  if (registered) return;
  registered = true;

  // A rebook not yet used names a client and service at the site being left (the web clears its
  // sessionStorage copy on a switch). Before the change, while its key is still the old site's.
  onBeforeSiteChange(() => clearRebookBootstrap());

  // The Terminal Location belongs to the old site's connected account.
  onSiteChange(() => clearTerminalLocationCache());

  // Every answer about the old site, and the writes queued while offline (`useStaffMe`'s profile
  // among them); screens still open move onto the new site's queries.
  onSiteChange(() => resetQueriesForSiteChange(queryClient), QUERY_RESET_ORDER);
}

/** Test seam. */
export function __resetSiteSwitchCleanupForTests(): void {
  registered = false;
}
