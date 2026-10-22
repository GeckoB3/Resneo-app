import { apiFetch } from '@/lib/api/client';
import { getActingVenueId, noteActiveVenueId, setChosenSite } from '@/lib/sites/active-site';
import { getSupabase } from '@/lib/supabase';
import type { MeSites } from '@/types/sites';

/**
 * Before a push for another site opens, switch to that site (web roles plan §6.2c). A device gets
 * the pushes of every site its login works at, and a booking, a sale sent from the web till, a
 * cash-up reminder or an online order only opens at its own site.
 *
 * Resolves true when the site changed, so the caller can clear the old site's screens first. Never
 * throws. Nothing changes when the push names no site (an older push), names the site the phone
 * already acts on, or names one this login does not belong to (left since, say): the screen then
 * opens as before and says itself that the item is not here.
 */
export async function switchSiteForPush(venueId: string | null | undefined): Promise<boolean> {
  if (!venueId) return false;
  if (getActingVenueId() === venueId) return false;
  try {
    // Asked of Supabase rather than the hook cache: on a launch from the push the hooks may not
    // have filled it yet.
    const { data } = await getSupabase().auth.getSession();
    const accessToken = data.session?.access_token ?? null;
    if (!accessToken) return false;
    // Which sites this login has, and which one the phone acts on now (the home site, when none
    // is chosen, is only known by asking).
    const me = await apiFetch<MeSites>('/api/v1/me/sites', { accessToken });
    noteActiveVenueId(me.active_venue_id ?? null);
    if (me.active_venue_id === venueId) return false;
    if (!me.sites.some((site) => site.venue_id === venueId)) return false;
    await setChosenSite(venueId);
    return true;
  } catch {
    return false;
  }
}
