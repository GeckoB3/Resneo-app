/**
 * The POS switch (plan §4.22, test plan DEV-04 / APP-08): only an explicit `pos_enabled: true`
 * in the resolved flags turns Checkout on, and every action follows the capability map.
 */
import { canPos, cardAppAvailable, isPosEnabled, showPosCheckout } from '@/lib/pos/pos-enabled';
import type { PosBootstrap } from '@/types/pos';
import type { VenueBootstrap } from '@/types/venue';

const flags = (resolved: Record<string, boolean>) =>
  ({ feature_flags: { raw: {}, resolved } }) as unknown as Pick<VenueBootstrap, 'feature_flags'>;

describe('isPosEnabled', () => {
  it('is on only for pos_enabled: true', () => {
    expect(isPosEnabled(flags({ pos_enabled: true }))).toBe(true);
  });

  it('is off when the flag is off, missing (an older web deploy) or the venue is not loaded', () => {
    expect(isPosEnabled(flags({ pos_enabled: false }))).toBe(false);
    expect(isPosEnabled(flags({ waitlist_v2: true }))).toBe(false);
    expect(isPosEnabled(null)).toBe(false);
    expect(isPosEnabled(undefined)).toBe(false);
    expect(isPosEnabled({ feature_flags: undefined } as unknown as VenueBootstrap)).toBe(false);
  });
});

describe('canPos', () => {
  const boot = { capabilities: { take_payment: true, refund: false } } as unknown as PosBootstrap;

  it('allows only what the map says', () => {
    expect(canPos(boot, 'take_payment')).toBe(true);
    expect(canPos(boot, 'refund')).toBe(false);
  });

  it('treats a missing key, or no bootstrap yet, as not allowed', () => {
    expect(canPos(boot, 'override_price')).toBe(false);
    expect(canPos(undefined, 'take_payment')).toBe(false);
  });
});

describe('cardAppAvailable', () => {
  const ready = { card_methods: { card_app: true }, capabilities: { take_payment: true } } as unknown as PosBootstrap;
  const check = (bootstrap: PosBootstrap, terminalAvailable = true, publishableKey = true) =>
    cardAppAvailable({ bootstrap, terminalAvailable, publishableKey });

  it('needs the venue, the build and the login all ready', () => {
    expect(check(ready)).toBe(true);
    expect(check(ready, false)).toBe(false);
    expect(check(ready, true, false)).toBe(false);
    expect(check({ ...ready, card_methods: { card_app: false } })).toBe(false);
    expect(check({ ...ready, capabilities: { take_payment: false } })).toBe(false);
  });
});

describe('showPosCheckout (the booking detail)', () => {
  const on = flags({ pos_enabled: true });
  const base = { venue: on, canEdit: true, linked: false, status: 'Confirmed' };

  it('offers Check out at a POS venue, for every status but Cancelled', () => {
    expect(showPosCheckout(base)).toBe(true);
    expect(showPosCheckout({ ...base, status: 'Completed' })).toBe(true);
    expect(showPosCheckout({ ...base, status: 'Cancelled' })).toBe(false);
  });

  it("keeps today's booking detail with the switch off, and on a partner's or view-only booking", () => {
    expect(showPosCheckout({ ...base, venue: flags({ pos_enabled: false }) })).toBe(false);
    expect(showPosCheckout({ ...base, venue: flags({}) })).toBe(false);
    expect(showPosCheckout({ ...base, linked: true })).toBe(false);
    expect(showPosCheckout({ ...base, canEdit: false })).toBe(false);
  });
});
