/**
 * The switch screens' words follow the house rules (CLAUDE.md; design section 14): no em-dash
 * anywhere, straight apostrophes, no currency symbol before a money placeholder, a count of one in
 * the singular, and the design's own sentences word for word where the app uses them.
 */
import { alsoCheckoutSentence, extraLanding, SWITCH_COPY, swT, switchName } from '@/lib/pos/switches/copy';

describe('the switch copy deck', () => {
  const entries = Object.entries(SWITCH_COPY);

  it('never uses an em-dash', () => {
    const EM_DASH = String.fromCharCode(0x2014);
    expect(entries.filter(([, text]) => text.includes(EM_DASH)).map(([id]) => id)).toEqual([]);
  });

  it('uses straight apostrophes and quotes', () => {
    const curly = [0x2018, 0x2019, 0x201c, 0x201d].map((c) => String.fromCharCode(c));
    expect(entries.filter(([, text]) => curly.some((c) => text.includes(c))).map(([id]) => id)).toEqual([]);
  });

  it('never writes a currency symbol next to a money placeholder', () => {
    expect(entries.filter(([, text]) => /[£€]\{/.test(text)).map(([id]) => id)).toEqual([]);
  });

  it('never names a country or a competitor', () => {
    const banned = /northern ireland|great britain|\bGB\b|england|scotland|wales|fresha|phorest|booksy|square|vagaro|shopify/i;
    expect(entries.filter(([, text]) => banned.test(text)).map(([id]) => id)).toEqual([]);
  });

  it("keeps the design's app copy (step 8) and shared sentences word for word", () => {
    expect(SWITCH_COPY['app.sw.tile']).toBe('Checkout');
    expect(SWITCH_COPY['app.sw.title']).toBe('Take payments on your phone and at your desk');
    expect(SWITCH_COPY['app.sw.body']).toBe(
      'Check clients out in two taps, take cards with Tap to Pay, sell products and send receipts. Included in your plan.',
    );
    expect(SWITCH_COPY['app.sw.switchOn']).toBe('Switch on Checkout');
    expect(SWITCH_COPY['app.sw.adminOnly']).toBe('Ask an admin to switch on Checkout.');
    expect(SWITCH_COPY['sw.on.done']).toBe("Checkout is on. Let's get it ready.");
    expect(SWITCH_COPY['sw.off.vouchers.ack']).toBe("We'll still honour these gift vouchers.");
    expect(SWITCH_COPY['sw.landing.cost.included'].startsWith('Included in your plan.')).toBe(true);
  });

  it("keeps the owner's Booking settings words (2026-10-22) word for word with the web", () => {
    expect(SWITCH_COPY['sw.bs.title']).toBe('Checkout: your till');
    expect(SWITCH_COPY['sw.bs.body']).toBe(
      "A full point of sale on the web and in the ResNeo app. Check clients out after their appointment, sell products and gift vouchers, take cash, cards and tips, send receipts, cash up at the end of the day and see your takings. It's included in your plan.",
    );
    expect(SWITCH_COPY['sw.bs.cardsOff']).toBe('To take cards at the till, also turn on Card payments in person, above.');
    expect(SWITCH_COPY['sw.bs.which.title']).toBe('Which do I need?');
    expect(SWITCH_COPY['sw.bs.which.cards']).toBe(
      'Just want to take a card or cash for an appointment on your phone? Turn on Card payments in person.',
    );
    expect(SWITCH_COPY['sw.bs.which.till']).toBe(
      'Want a till for products, receipts and cashing up? Turn on Checkout, and Card payments in person to take cards at it.',
    );
    expect(SWITCH_COPY['sw.bs.switch']).toBe('Use Checkout');
  });

  it('has no email copy (SW9: the history is the record)', () => {
    expect(Object.keys(SWITCH_COPY).filter((id) => id.includes('email'))).toEqual([]);
  });

  it('fills placeholders and uses the singular for one', () => {
    expect(swT('sw.on.title', { venue: 'Bloom Hair Studio' })).toBe('Switch on Checkout for Bloom Hair Studio?');
    expect(swT('sw.off.warn.open', { count: 3 })).toBe("3 sales are still open. They'll be waiting if you switch Checkout back on.");
    expect(swT('sw.off.warn.open', { count: 1 })).toBe("1 sale is still open. It'll be waiting if you switch Checkout back on.");
    expect(swT('sw.off.warn.links', { count: 1, date: '14 October' })).toBe(
      "1 pay link can still be paid until 14 October. Cancel it if you don't want that.",
    );
    expect(swT('sw.off.warn.rewards', { count: 5 })).toBe("5 clients have a loyalty reward waiting. They're kept for if you switch back on.");
  });

  it('names the four switches', () => {
    expect(switchName('pos_enabled')).toBe('Checkout');
    expect(switchName('pos_gift_vouchers_enabled')).toBe('Gift vouchers');
    expect(switchName('pos_loyalty_enabled')).toBe('Loyalty card');
    expect(switchName('pos_online_shop_enabled')).toBe('Online shop');
  });

  it("splits the landing's extras into a name and a line, as the web does", () => {
    expect(extraLanding('pos_gift_vouchers_enabled')).toEqual({ name: 'Gift vouchers', description: 'Sell them at your desk and online.' });
    expect(extraLanding('pos_online_shop_enabled')).toEqual({ name: 'Online shop', description: 'Sell products for collection or delivery.' });
    expect(alsoCheckoutSentence('pos_loyalty_enabled')).toBe(SWITCH_COPY['sw.on.alsoCheckout.loyalty']);
  });

  it('never promises that support will turn something on, and names only places the app has', () => {
    expect(entries.filter(([, text]) => /turn it on for you/i.test(text)).map(([id]) => id)).toEqual([]);
    expect(entries.filter(([, text]) => /Settings, (Checkout|Plan)/.test(text)).map(([id]) => id)).toEqual([]);
  });
});
