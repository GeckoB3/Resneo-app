import { useEffect, useState } from 'react';

/**
 * "Hide this" on the Today offer card (design section 12, step 1), for the moment between pressing
 * it and the venue being read again.
 *
 * The dismissal itself is the server's (`POST /api/venue/prompts/dismiss` with `pos_offer`, kept on
 * the staff row), and `GET /api/venue` carries it back as `dismissed_prompts` and a shut
 * `feature_offers.pos_door`, so the web's card and menu item hide too. This only hides the card
 * at once on this phone; it lives for the app session and is never
 * stored, so the server stays the one record.
 */

const hiddenScopes = new Set<string>();
const listeners = new Set<() => void>();

/** The scope for one person at one venue, or null until both are known. */
export function offerScope(venueId: string | null | undefined, staffId: string | null | undefined): string | null {
  return venueId && staffId ? `${venueId}_${staffId}` : null;
}

/** Records that this person hid the offer here. */
export function rememberOfferHidden(scope: string): void {
  hiddenScopes.add(scope);
  for (const listener of listeners) listener();
}

/** Whether this person pressed "Hide this" on this phone during this session. */
export function useOfferHidden(scope: string | null): boolean {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return scope !== null && hiddenScopes.has(scope);
}

/** Test seam: forget everything in memory. */
export function __resetOfferHiddenForTests(): void {
  hiddenScopes.clear();
  listeners.clear();
}
