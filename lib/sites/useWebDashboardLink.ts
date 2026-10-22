import { useCallback } from 'react';

import { linkSiteId, withSiteParam } from '@/lib/sites/web-links';
import { useVenueContext } from '@/providers/VenueProvider';

/**
 * `(urlOrPath) => urlOrPath` with `?site=<venue_id>` for the venue this screen shows (web roles plan
 * §6.2b), for any link that opens the web dashboard. Uses the loaded venue, falling back to the
 * site this phone acts on; anything that is not a dashboard link comes back unchanged. A full URL
 * counts as the web's when it is on `webOrigin` (default `getWebUrl()`). Needs VenueProvider, as
 * every screen in the app has.
 */
export function useWebDashboardLink(): (urlOrPath: string, webOrigin?: string) => string {
  const { venue } = useVenueContext();
  const loadedVenueId = venue?.id ?? null;
  return useCallback(
    (urlOrPath: string, webOrigin?: string) => withSiteParam(urlOrPath, linkSiteId(loadedVenueId), webOrigin),
    [loadedVenueId],
  );
}
