/**
 * A booking written from the app also makes the other businesses' services of a visit across
 * businesses stale (web split-visit plan 7.2, 7.5): "Move every business's services together" moves
 * them, and a part cancel changes what the card lists. Found 2026-11-04 on the phone: after a
 * move-all the card kept the partner's old time until the app came back to the foreground.
 *
 * Driven through a real QueryClient: what matters is whether the cache entry goes stale.
 */
import { QueryClient } from '@tanstack/react-query';

import { invalidateBookingCaches } from '@/lib/queries/useBookingMutations';

const PARTNER_LINES = ['visit-partner-lines', 'token-scope', 'lv-1'] as const;

describe('invalidateBookingCaches', () => {
  it("makes a visit's partner lines stale, so the card reads the other businesses' new times", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    client.setQueryData(PARTNER_LINES, new Map([['lv-1', []]]));
    expect(client.getQueryState(PARTNER_LINES)?.isInvalidated).toBe(false);
    invalidateBookingCaches(client, 'token', 'booking-1');
    expect(client.getQueryState(PARTNER_LINES)?.isInvalidated).toBe(true);
    client.clear();
  });
});
