import { useRouter, type Href } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import { useMeSites } from '@/lib/queries/useMeSites';
import {
  isSiteLost,
  isSiteOfferDue,
  subscribeSiteOffer,
  takeSiteLost,
  takeSiteOffer,
} from '@/lib/sites/active-site';
import { SITES_COPY, offersSitePickerAfterSignIn } from '@/lib/sites/sites';
import { useToast } from '@/providers/ToastProvider';

/**
 * After signing in, offer the site picker once (web roles plan §6.2c, §6.7): only to someone with
 * more than one site or an invitation waiting. The picker leads to All sites for anyone the
 * overview applies to. A launch with a stored session is not a sign-in, and offers nothing.
 *
 * It also says, once, when the chosen site has refused this login (removed from that business):
 * the app is back on the person's home site by then (`apiFetch`, 403 SITE_NOT_AVAILABLE).
 *
 * Renders nothing. Lives inside the (app) navigator, after the staff check, so it can only push
 * while there is a navigator to receive it (as `PendingPushRouteHandler`).
 */
export function SiteChoiceOffer({ ready }: { ready: boolean }): null {
  const router = useRouter();
  const toast = useToast();
  const due = useSyncExternalStore(subscribeSiteOffer, isSiteOfferDue, isSiteOfferDue);
  const lost = useSyncExternalStore(subscribeSiteOffer, isSiteLost, isSiteLost);
  const sites = useMeSites({ enabled: ready && due });

  useEffect(() => {
    if (!ready || !lost) return;
    if (takeSiteLost()) toast.info(SITES_COPY.lostAccess);
  }, [ready, lost, toast]);

  useEffect(() => {
    if (!ready || !due) return;
    if (sites.isError) {
      // A server without the route, or a failed read: one site as far as anyone knows.
      takeSiteOffer();
      return;
    }
    if (!sites.data) return;
    if (!takeSiteOffer()) return;
    if (offersSitePickerAfterSignIn(sites.data)) {
      router.push('/sites?welcome=1' as Href);
    }
  }, [ready, due, sites.data, sites.isError, router]);

  return null;
}
