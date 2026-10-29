/**
 * What the switch screens show (POS Part 5): the landing's states, the extras it offers, the calls
 * "Switch on and set up" makes, the extras group and an extra's own screen while it is off, the off
 * sheet's refusals, warnings and tick, the venue the app shows at once after a change, the way
 * back, the history lines, refusals in words, and the door (the Today card).
 */
import { ApiError } from '@/lib/api/client';
import { readSwitchRefusal } from '@/lib/pos/switches/api';
import {
  alsoCheckoutLine,
  canConfirmOff,
  extraOffSentence,
  extraOffState,
  extraReasonSentence,
  extraRows,
  extrasForSentence,
  historyLine,
  historyWhen,
  landingExtras,
  landingState,
  leavesSomethingToFinish,
  needsSellerTick,
  offerDoorOpen,
  offerFromSwitches,
  offRefusal,
  offSheetCopy,
  offSheetModel,
  parseMissedExtras,
  pausedSentence,
  salesHistoryBootstrap,
  sinceLine,
  switchDay,
  switchOnSteps,
  switchRefusalSentence,
  venueWithSwitches,
  wayBack,
} from '@/lib/pos/switches/model';
import { onResponse, switchesResponse } from '@/lib/pos/switches/test-fixtures';
import type { PosSwitchHistoryRow, PosSwitchOffer } from '@/types/pos-switches';
import type { VenueBootstrap } from '@/types/venue';

const offer = (over: Partial<PosSwitchOffer> = {}): PosSwitchOffer => ({ state: 'not_available', reason: null, public_reason: null, ...over });
const NOW = new Date('2026-10-11T12:00:00Z');
const TZ = 'Europe/London';

describe('landingState', () => {
  it('is the staff message for anyone but an admin (SW1)', () => {
    expect(landingState({ isAdmin: false, offer: offer({ state: 'available' }) })).toEqual({ kind: 'staff' });
  });

  it('follows the offer until the switches are read', () => {
    expect(landingState({ isAdmin: true, offer: offer({ state: 'available' }) })).toEqual({ kind: 'available' });
    expect(landingState({ isAdmin: true, offer: offer({ state: 'paused', reason: 'blocked', public_reason: 'We are checking a payment.' }) })).toEqual({
      kind: 'paused',
      publicReason: 'We are checking a payment.',
    });
    expect(landingState({ isAdmin: true, offer: offer({ state: 'paused', reason: 'environment' }) })).toEqual({ kind: 'environment' });
    expect(landingState({ isAdmin: true, offer: offer({ reason: 'currency' }) })).toEqual({ kind: 'currency' });
    expect(landingState({ isAdmin: true, offer: offer({ reason: 'billing' }) })).toEqual({ kind: 'billing' });
    expect(landingState({ isAdmin: true, offer: offer({ reason: 'not_offered' }) })).toEqual({ kind: 'unavailable' });
  });

  it('reads an older server, which sends no offer, as not available', () => {
    expect(landingState({ isAdmin: true, offer: offer() })).toEqual({ kind: 'unavailable' });
  });

  it('lets the switches have the last word once read', () => {
    expect(landingState({ isAdmin: true, offer: offer({ state: 'available' }), switches: switchesResponse() })).toEqual({ kind: 'available' });
    expect(
      landingState({
        isAdmin: true,
        offer: offer({ state: 'available' }),
        switches: switchesResponse({ switches: { pos_enabled: { platform_state: 'blocked', public_reason: 'Paused.', can_switch_on: false } } }),
      }),
    ).toEqual({ kind: 'paused', publicReason: 'Paused.' });
    expect(landingState({ isAdmin: true, offer: offer({ state: 'available' }), switches: switchesResponse({ environment_off: true }) })).toEqual({
      kind: 'environment',
    });
    expect(
      landingState({
        isAdmin: true,
        offer: offer({ state: 'available' }),
        switches: switchesResponse({ switches: { pos_enabled: { can_switch_on: false, unavailable_reason: 'billing' } } }),
      }),
    ).toEqual({ kind: 'billing' });
    expect(landingState({ isAdmin: true, offer: offer({ state: 'available' }), switches: onResponse() })).toEqual({ kind: 'on' });
  });
});

describe('pausedSentence', () => {
  it("says ResNeo's public reason, ending it with a full stop", () => {
    expect(pausedSentence('Bloom', "we're checking a payment with Stripe")).toBe(
      "ResNeo has paused Checkout for Bloom: we're checking a payment with Stripe. You can still see past sales and give refunds. Contact ResNeo support if you have any questions.",
    );
  });

  it('reads well without a reason', () => {
    expect(pausedSentence('Bloom', null)).toBe(
      'ResNeo has paused Checkout for Bloom. You can still see past sales and give refunds. Contact ResNeo support if you have any questions.',
    );
  });
});

describe('the landing extras', () => {
  it('offers only what the dial offers and ResNeo has not paused', () => {
    expect(landingExtras(switchesResponse())).toEqual(['pos_gift_vouchers_enabled', 'pos_loyalty_enabled']);
    expect(
      landingExtras(
        switchesResponse({
          switches: {
            pos_loyalty_enabled: { platform_state: 'blocked' },
            pos_online_shop_enabled: { offered: true, can_switch_on: false, unavailable_reason: 'needs_checkout' },
          },
        }),
      ),
    ).toEqual(['pos_gift_vouchers_enabled', 'pos_online_shop_enabled']);
    expect(landingExtras(null)).toEqual([]);
  });
});

describe('switching on', () => {
  it('switches Checkout alone when no extra is ticked', () => {
    expect(switchOnSteps([])).toEqual([{ feature: 'pos_enabled', alsoCheckout: false }]);
  });

  it('brings Checkout with the first extra (SW4), then the others in order', () => {
    expect(switchOnSteps(['pos_loyalty_enabled', 'pos_gift_vouchers_enabled'])).toEqual([
      { feature: 'pos_gift_vouchers_enabled', alsoCheckout: true },
      { feature: 'pos_loyalty_enabled', alsoCheckout: false },
    ]);
  });

  it("says Checkout comes with the first extra ticked, in the web's words for each", () => {
    expect(alsoCheckoutLine([])).toBeNull();
    expect(alsoCheckoutLine(['pos_gift_vouchers_enabled', 'pos_loyalty_enabled'])).toBe(
      "Gift vouchers are taken as payment at Checkout, so we'll switch that on too, in its simplest form.",
    );
    expect(alsoCheckoutLine(['pos_loyalty_enabled'])).toBe(
      "Loyalty rewards are used at Checkout, so we'll switch that on too, in its simplest form.",
    );
    expect(alsoCheckoutLine(['pos_online_shop_enabled'])).toContain('Online shop orders are paid and refunded through Checkout');
  });

  it("asks for the seller's tick at the first switch-on only (SW8)", () => {
    expect(needsSellerTick(switchesResponse({ terms_accepted: false }))).toBe(true);
    expect(needsSellerTick(switchesResponse({ terms_accepted: true }))).toBe(false);
  });

  it('names the extras that did not come on', () => {
    expect(extrasForSentence(['pos_loyalty_enabled'])).toBe('loyalty card');
    expect(extrasForSentence(['pos_gift_vouchers_enabled', 'pos_loyalty_enabled', 'pos_online_shop_enabled'])).toBe(
      'gift vouchers, loyalty card and online shop',
    );
    expect(parseMissedExtras('pos_loyalty_enabled,pos_enabled,nonsense')).toEqual(['pos_loyalty_enabled']);
    expect(parseMissedExtras(undefined)).toEqual([]);
  });
});

describe('the extras group in Checkout settings', () => {
  it('shows each extra on, off or paused by ResNeo, and leaves out one not offered and off', () => {
    const rows = extraRows(
      onResponse({
        switches: {
          pos_gift_vouchers_enabled: { effective: true, venue_choice: true, can_switch_on: false },
          pos_loyalty_enabled: { platform_state: 'blocked', venue_choice: true, public_reason: 'Paused for now.', can_switch_on: false },
        },
      }),
    );
    expect(rows.map((r) => [r.key, r.status, r.value, r.canChange])).toEqual([
      ['pos_gift_vouchers_enabled', 'on', true, true],
      ['pos_loyalty_enabled', 'paused', false, false],
    ]);
    expect(rows[1].publicReason).toBe('Paused for now.');
  });

  it('keeps an offered extra that cannot go on now, with its reason', () => {
    const rows = extraRows(onResponse({ switches: { pos_loyalty_enabled: { can_switch_on: false, unavailable_reason: 'billing' } } }));
    const loyalty = rows.find((r) => r.key === 'pos_loyalty_enabled');
    expect(loyalty).toMatchObject({ status: 'off', canChange: false, reason: 'billing' });
    expect(extraReasonSentence('billing', 'Bloom')).toBe(
      'Your plan needs attention. Once your subscription is sorted in Plan & payments, you can switch on Checkout.',
    );
    expect(extraReasonSentence('not_offered', 'Bloom')).toBe(
      "Checkout can't be switched on for Bloom right now. Contact ResNeo support if you have any questions.",
    );
    expect(extraReasonSentence(null, 'Bloom')).toBeNull();
  });
});

describe("an extra's own settings while it is off", () => {
  it('points an admin at Checkout settings while ResNeo offers it', () => {
    const state = extraOffState(onResponse(), 'pos_loyalty_enabled');
    expect(state).toEqual({ kind: 'switch_on' });
    expect(extraOffSentence(state, 'Bloom')).toBe('You can switch it on in Checkout settings, under Extras.');
  });

  it("says ResNeo paused it, with ResNeo's reason when it gave one", () => {
    const paused = extraOffState(
      onResponse({ switches: { pos_loyalty_enabled: { platform_state: 'blocked', public_reason: 'we are moving cards over', can_switch_on: false } } }),
      'pos_loyalty_enabled',
    );
    expect(paused).toEqual({ kind: 'paused', publicReason: 'we are moving cards over' });
    expect(extraOffSentence(paused, 'Bloom')).toBe(
      'ResNeo has paused it for your business: we are moving cards over. Contact ResNeo support if you have any questions.',
    );
    expect(extraOffSentence({ kind: 'paused', publicReason: null }, 'Bloom')).toBe(
      'ResNeo has paused it for your business. Contact ResNeo support if you have any questions.',
    );
  });

  it("says it isn't available yet when not offered, or from a server without the switches, promising nothing", () => {
    const notOffered = extraOffState(onResponse(), 'pos_online_shop_enabled');
    expect(notOffered).toEqual({ kind: 'unavailable', reason: 'not_offered' });
    expect(extraOffSentence(notOffered, 'Bloom')).toBe("It isn't available for your business yet.");
    expect(extraOffState(null, 'pos_gift_vouchers_enabled')).toEqual({ kind: 'unavailable', reason: null });
    expect(extraOffSentence({ kind: 'unavailable', reason: null }, 'Bloom')).not.toMatch(/turn it on for you/);
    expect(extraOffSentence({ kind: 'unavailable', reason: 'billing' }, 'Bloom')).toMatch(/^Your plan needs attention/);
  });

  it('tells a team member an admin can switch it on', () => {
    expect(extraOffSentence('staff', 'Bloom')).toBe('An admin can switch it on in Checkout settings.');
  });
});

describe('the off sheet', () => {
  it("names each switch's own title, line and keep button (the web's)", () => {
    expect(offSheetCopy('pos_enabled')).toEqual({ title: 'sw.off.title', body: 'sw.off.body', keep: 'sw.off.keep' });
    expect(offSheetCopy('pos_loyalty_enabled')).toEqual({
      title: 'sw.extraOff.loyalty.title',
      body: 'sw.extraOff.loyalty.body',
      keep: 'sw.extraOff.keep',
    });
  });

  it('refuses while money is moving, naming the sale (SW5)', () => {
    const model = offSheetModel(
      'pos_enabled',
      onResponse({
        in_use: {
          blocking: [
            { kind: 'card_payment_in_progress', sale_id: 's1', sale_number: 1042 },
            { kind: 'sale_waiting_on_phone', sale_id: 's2', sale_number: 1043 },
          ],
        },
      }).in_use,
      { timeZone: TZ, now: NOW },
    );
    expect(model.refusals.map((r) => r.text)).toEqual([
      'A card payment is in progress on sale 1042. Finish or cancel it first.',
      'Sale 1043 is waiting for a phone to take the card. Cancel it first.',
    ]);
    expect(model.refusals[0].linkLabel).toBe('Open sale 1042');
    expect(canConfirmOff(model, true)).toBe(false);
  });

  it('says a refusal without a sale number plainly', () => {
    expect(offRefusal({ kind: 'sale_waiting_on_phone', sale_id: 's', sale_number: null })).toEqual({
      kind: 'sale_waiting_on_phone',
      saleId: 's',
      text: 'A sale is waiting for a phone to take the card. Cancel it first.',
      linkLabel: 'Open the sale',
    });
  });

  it('warns with counts for the rest, and asks for the vouchers tick', () => {
    const model = offSheetModel(
      'pos_enabled',
      onResponse({
        in_use: {
          till_open: true,
          open_sales: 3,
          part_paid_sales: 1,
          unpaid_pay_links: 2,
          pay_links_last_expires_at: '2026-10-14T18:00:00Z',
          unfinished_orders: 2,
          stored_value_count: 4,
          stored_value_outstanding_pence: 42000,
          rewards_waiting: 5,
        },
      }).in_use,
      { timeZone: TZ, now: NOW, loyaltyOn: true },
    );
    expect(model.warnings.map((w) => w.text)).toEqual([
      'Your till is still open. Close it and count the cash first.',
      "3 sales are still open. They'll be waiting if you switch Checkout back on.",
      '1 sale is part paid. Take the rest, refund it, or send a pay link first.',
      "2 pay links can still be paid until 14 October. Cancel them if you don't want that.",
      '2 online orders still need handing over or sending. You can still do that from Orders.',
      "5 clients have a loyalty reward waiting. They're kept for if you switch back on.",
    ]);
    expect(model.storedValue).toBe('Your clients hold £420.00 of gift vouchers and credit. You still have to accept them, even with Checkout off.');
    expect(model.offerPauseLoyalty).toBe(true);
    expect(canConfirmOff(model, false)).toBe(false);
    expect(canConfirmOff(model, true)).toBe(true);
  });

  it('offers to pause loyalty only while the card is on, and says pay links plainly without a date', () => {
    const model = offSheetModel('pos_enabled', onResponse({ in_use: { rewards_waiting: 2, unpaid_pay_links: 1 } }).in_use, { timeZone: TZ });
    expect(model.offerPauseLoyalty).toBe(false);
    expect(model.warnings.find((w) => w.key === 'links')?.text).toBe("1 pay link can still be paid. Cancel it if you don't want that.");
  });

  it('lets Checkout go straight off when nothing is in use', () => {
    const model = offSheetModel('pos_enabled', onResponse().in_use, { timeZone: TZ, now: NOW });
    expect(model.refusals).toEqual([]);
    expect(model.warnings).toEqual([]);
    expect(canConfirmOff(model, false)).toBe(true);
  });

  it("says each extra's own warnings (section 7.3)", () => {
    const inUse = onResponse({ in_use: { stored_value_count: 1, stored_value_outstanding_pence: 2500, rewards_waiting: 2, unfinished_orders: 1 } }).in_use;
    const vouchers = offSheetModel('pos_gift_vouchers_enabled', inUse, { timeZone: TZ });
    expect(vouchers.storedValue).toBe(
      'Your clients hold £25.00 of gift vouchers and credit. They can still use them at Checkout, and you still have to accept them.',
    );
    expect(vouchers.warnings).toEqual([]);
    const loyalty = offSheetModel('pos_loyalty_enabled', inUse, { timeZone: TZ });
    expect(loyalty.offerPauseLoyalty).toBe(true);
    expect(loyalty.storedValue).toBeNull();
    const shop = offSheetModel('pos_online_shop_enabled', inUse, { timeZone: TZ });
    expect(shop.warnings.map((w) => w.key)).toEqual(['orders']);
  });

  it("knows when something is left to finish once Checkout is off (the web's rule)", () => {
    expect(leavesSomethingToFinish(onResponse().in_use)).toBe(false);
    expect(leavesSomethingToFinish(onResponse({ in_use: { part_paid_sales: 1 } }).in_use)).toBe(true);
    expect(leavesSomethingToFinish(onResponse({ in_use: { till_open: true } }).in_use)).toBe(true);
    expect(leavesSomethingToFinish(onResponse({ in_use: { unpaid_pay_links: 1 } }).in_use)).toBe(true);
    // Open sales with nothing paid wait, untouched, for Checkout to come back.
    expect(leavesSomethingToFinish(onResponse({ in_use: { open_sales: 2 } }).in_use)).toBe(false);
  });
});

describe('a refused switch in words', () => {
  const refused = (status: number, body: Record<string, unknown>) => readSwitchRefusal(new ApiError('x', status, body));

  it("says the web's sentence for each refusal", () => {
    expect(switchRefusalSentence(refused(403, { error: 'x' }), 'Bloom')).toBe('Only an admin can switch Checkout on or off.');
    expect(switchRefusalSentence(refused(412, { error: 'x', code: 'SWITCH_STALE' }), 'Bloom')).toBe(
      "Someone else changed Checkout while you were looking. We've loaded the latest. Check it, then try again.",
    );
    expect(switchRefusalSentence(refused(409, { error: 'x', code: 'SWITCH_NEEDS_ACKNOWLEDGEMENT', needs: ['terms'] }), 'Bloom')).toBe(
      'Tick the box to say you understand, then try again.',
    );
    expect(
      switchRefusalSentence(refused(409, { error: 'x', code: 'SWITCH_NEEDS_ACKNOWLEDGEMENT', needs: ['stored_value_outstanding'] }), 'Bloom'),
    ).toBe("Tick the box to say you'll still honour these gift vouchers, then try again.");
    expect(switchRefusalSentence(refused(409, { error: 'x', code: 'SWITCH_NOT_AVAILABLE', reason: 'currency' }), 'Bloom')).toBe(
      "Checkout works in pounds for now. We'll let you know when it works in euros.",
    );
    expect(switchRefusalSentence(readSwitchRefusal(new ApiError('Offline', 0)), 'Bloom')).toBe(
      "We couldn't reach ResNeo. Check your connection and try again.",
    );
    expect(switchRefusalSentence(refused(500, { error: 'Internal server error' }), 'Bloom')).toBe("We couldn't save that. Please try again.");
    expect(switchRefusalSentence(refused(409, { error: 'x', code: 'SWITCH_IN_USE', blocking: [] }), 'Bloom')).toBeNull();
  });
});

describe('after a change', () => {
  const venue = {
    id: 'v1',
    name: 'Bloom',
    feature_flags: { raw: { waitlist_v2: true }, resolved: { waitlist_v2: true } },
    feature_offers: { pos: { state: 'available', reason: null, public_reason: null }, pos_door: true },
  } as unknown as VenueBootstrap;

  it('turns the tiles on at once from the answer, and shuts the door', () => {
    const next = venueWithSwitches(
      venue,
      onResponse({ switches: { pos_gift_vouchers_enabled: { effective: true, venue_choice: true, can_switch_on: false } } }),
    );
    expect(next.feature_flags.resolved).toMatchObject({
      waitlist_v2: true,
      pos_enabled: true,
      pos_gift_vouchers_enabled: true,
      pos_loyalty_enabled: false,
    });
    expect(next.feature_offers?.pos?.state).toBe('on');
    expect(next.feature_offers?.pos_door).toBe(false);
  });

  it('reads the offer back from the switches', () => {
    expect(offerFromSwitches(switchesResponse()).state).toBe('available');
    expect(offerFromSwitches(switchesResponse({ environment_off: true }))).toMatchObject({ state: 'paused', reason: 'environment' });
    expect(
      offerFromSwitches(switchesResponse({ switches: { pos_enabled: { platform_state: 'blocked', public_reason: 'Paused.', can_switch_on: false } } })),
    ).toMatchObject({ state: 'paused', public_reason: 'Paused.' });
  });
});

describe('the way back (section 7.2)', () => {
  it('asks nothing of a venue that never had Checkout', () => {
    expect(wayBack({ finishing: false, isAdmin: true, orders: { newCount: 1, unfinishedCount: 2 }, openSales: 3, tillOpen: true })).toEqual({
      orders: false,
      ordersNewCount: null,
      salesHistory: false,
    });
  });

  it('keeps Orders and Sales history while something is left to finish', () => {
    expect(wayBack({ finishing: true, isAdmin: true, orders: { newCount: 1, unfinishedCount: 2 }, openSales: 0 })).toEqual({
      orders: true,
      ordersNewCount: 1,
      salesHistory: true,
    });
    expect(wayBack({ finishing: true, isAdmin: true, orders: null, openSales: 2 })).toMatchObject({ orders: false, salesHistory: true });
    expect(wayBack({ finishing: true, isAdmin: true, orders: null, openSales: 0, tillOpen: true })).toMatchObject({ salesHistory: true });
    expect(wayBack({ finishing: true, isAdmin: true, orders: { newCount: 0, unfinishedCount: 0 }, openSales: 0, tillOpen: false })).toMatchObject({
      orders: false,
      salesHistory: false,
    });
  });

  it('keeps Sales history for admins only', () => {
    expect(wayBack({ finishing: true, isAdmin: false, orders: { newCount: 0, unfinishedCount: 1 }, openSales: 2, tillOpen: true })).toMatchObject({
      orders: true,
      salesHistory: false,
    });
  });

  it('lets Sales history refund and nothing else', () => {
    const boot = salesHistoryBootstrap({ name: 'Bloom', currency: 'GBP', timezone: TZ }, true);
    expect(boot.capabilities).toEqual({ refund: true });
    expect(boot.role).toBe('admin');
    expect(salesHistoryBootstrap({ name: 'Bloom', currency: 'GBP', timezone: TZ }, false).capabilities).toEqual({});
  });
});

describe('the history (SW9)', () => {
  const row = (over: Partial<PosSwitchHistoryRow>): PosSwitchHistoryRow => ({
    id: 'h1',
    feature: 'pos_enabled',
    action: 'on',
    layer: 'venue',
    actor_name: 'Sam',
    by_resneo: false,
    public_reason: null,
    created_at: '2026-10-11T09:04:00Z',
    ...over,
  });

  it("says who did what, in the web's words", () => {
    expect(historyLine(row({}))).toBe('Checkout switched on by Sam');
    expect(historyLine(row({ action: 'off', feature: 'pos_gift_vouchers_enabled' }))).toBe('Gift vouchers switched off by Sam');
    expect(historyLine(row({ by_resneo: true, actor_name: 'support@resneo.com' }))).toBe('Checkout switched on by ResNeo');
    expect(historyLine(row({ action: 'block', layer: 'platform' }))).toBe('Checkout paused by ResNeo');
    expect(historyLine(row({ action: 'unblock', feature: 'pos_loyalty_enabled' }))).toBe('Loyalty card pause lifted by ResNeo');
    expect(historyLine(row({ action: 'invite', feature: 'pos_online_shop_enabled' }))).toBe('Online shop offered to you by ResNeo');
    expect(historyLine(row({ action: 'uninvite', feature: 'pos_online_shop_enabled' }))).toBe('Online shop no longer offered by ResNeo');
    expect(historyLine(row({ action: 'repair' }))).toBe('Checkout setting corrected by ResNeo');
    expect(historyLine(row({ action: 'backfill', actor_name: null, layer: 'system' }))).toBe('Checkout setting recorded by ResNeo');
  });

  it("dates it in the venue's time", () => {
    expect(historyWhen(row({}), TZ, NOW)).toBe('11 October at 10:04');
    expect(switchDay('2025-03-02T10:00:00Z', TZ, NOW)).toBe('2 March 2025');
  });

  it('says who switched Checkout on, when known', () => {
    expect(sinceLine(onResponse(), TZ, NOW)).toBe('Switched on by Sam Taylor on 11 October.');
    expect(sinceLine(onResponse({ switches: { pos_enabled: { set_by_name: null } } }), TZ, NOW)).toBeNull();
  });
});

describe('the door: the Today card (step 1, section 12)', () => {
  const base = {
    isAdmin: true,
    posEnabled: false,
    offer: offer({ state: 'available' }),
    door: true,
    dismissed: false,
    hiddenHere: false,
  };

  it('opens for an admin while the server says so', () => {
    expect(offerDoorOpen(base)).toBe(true);
  });

  it('stays shut when the server shuts it: a venue that has made a sale, or one whose admin hid it', () => {
    expect(offerDoorOpen({ ...base, door: false })).toBe(false);
    expect(offerDoorOpen({ ...base, dismissed: true })).toBe(false);
  });

  it('shuts at once on this phone after "Hide this"', () => {
    expect(offerDoorOpen({ ...base, hiddenHere: true })).toBe(false);
  });

  it('stays shut for team members, once Checkout is on, while paused or not offered', () => {
    expect(offerDoorOpen({ ...base, isAdmin: false })).toBe(false);
    expect(offerDoorOpen({ ...base, posEnabled: true })).toBe(false);
    expect(offerDoorOpen({ ...base, offer: offer({ state: 'paused' }) })).toBe(false);
    expect(offerDoorOpen({ ...base, offer: offer() })).toBe(false);
  });
});
