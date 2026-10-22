import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

import { getActingVenueId, setChosenSite } from '@/lib/sites/active-site';

/**
 * Switch the phone to another site, then open a screen there (web roles plan §6.2c, §6.7): that
 * site's Today by default, or its Plan page from the All sites overview.
 *
 * `setChosenSite` lets go of everything tied to the old site before it resolves. The screens on the
 * stack belong to the old site too, so they are dismissed before the new one opens. Choosing the
 * site the phone already acts on only opens the screen.
 */
export function useSwitchSite() {
  const router = useRouter();
  return useCallback(
    async (venueId: string, then: Href = '/today' as Href): Promise<void> => {
      if (getActingVenueId() !== venueId) {
        await setChosenSite(venueId);
      }
      if (router.canDismiss()) router.dismissAll();
      router.push(then);
    },
    [router],
  );
}
