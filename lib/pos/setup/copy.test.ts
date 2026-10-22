/**
 * The set-up screens' words follow the house rules (CLAUDE.md; design section 6.1): no em-dash
 * anywhere, straight apostrophes, no currency symbol before a money placeholder, no country or
 * competitor named, no place named that the app does not have, every placeholder filled, a count of
 * one in the singular, and the design's section 6.3 sentences word for word where the app uses them.
 */
import { SETUP_COPY, setupT, stepCardLabel, type SetupCopyId } from '@/lib/pos/setup/copy';
import { POS_SETUP_STEPS } from '@/types/pos-setup';

describe('the set-up copy deck', () => {
  const entries = Object.entries(SETUP_COPY) as [SetupCopyId, string][];

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
    const banned = /northern ireland|great britain|\bGB\b|\bUK\b|england|scotland|wales|fresha|phorest|booksy|square|vagaro|shopify|timely/i;
    expect(entries.filter(([, text]) => banned.test(text)).map(([id]) => id)).toEqual([]);
  });

  it('names only places the app has (Checkout settings, not "Settings, Checkout"; no Home)', () => {
    expect(entries.filter(([, text]) => /Settings, (Checkout|Payments|Booking)/.test(text)).map(([id]) => id)).toEqual([]);
    expect(entries.filter(([, text]) => /\bBack to Home\b|\bon Home\b/.test(text)).map(([id]) => id)).toEqual([]);
    expect(entries.filter(([, text]) => /Ready to check out/.test(text)).map(([id]) => id)).toEqual([]);
  });

  it('leaves no placeholder unfilled when its values are given', () => {
    for (const [id, text] of entries) {
      const names = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
      const vars = Object.fromEntries(names.map((n) => [n, n === 'count' ? 2 : 'x']));
      expect(setupT(id, vars)).not.toMatch(/\{\w+\}/);
    }
  });

  it("keeps the design's sentences word for word", () => {
    expect(SETUP_COPY['setup.welcome.title']).toBe("Let's get Checkout ready");
    expect(SETUP_COPY['setup.welcome.skipNote']).toBe('Not sure about something? Skip it. Checkout already works for cash.');
    expect(SETUP_COPY['setup.use.title']).toBe('What will you use Checkout for?');
    expect(SETUP_COPY['setup.pay.cash.count.yes.note']).toBe(
      "Open the till with a float in the morning, count it at the end of the day, and see if anything's missing.",
    );
    expect(SETUP_COPY['setup.cards.stripe.none.body']).toBe(
      "Stripe pays your card takings into your bank. It takes about ten minutes. You'll need your bank details and some photo ID.",
    );
    expect(SETUP_COPY['setup.cards.phone.devices']).toBe(
      "Works on iPhone XS or newer, and on Android phones with contactless that run Android 13 or newer. Tap to Pay on iPhone doesn't work on iPad.",
    );
    expect(SETUP_COPY['setup.tips.note']).toBe('Tips go to your team in full. ResNeo never takes a cut, and keeps a record of who got each one.');
    expect(SETUP_COPY['setup.practice.body']).toBe(
      'Get the feel of Checkout with a practice sale. Nothing is real: no money moves, no stock changes and nobody gets a message.',
    );
    expect(SETUP_COPY['setup.card.title']).toBe('Finish setting up Checkout');
    expect(SETUP_COPY['setup.saveLater']).toBe('Save and finish later');
    expect(SETUP_COPY['setup.skip']).toBe('Skip for now');
    // The owner's line of 2026-10-22, when choosing a phone or a reader turns the switch on.
    expect(SETUP_COPY['setup.cards.inPerson.turnedOn']).toBe("We've turned on Card payments in person for you, so Checkout can take cards.");
  });

  it('says what OB5 asks for under the profile fields', () => {
    expect(SETUP_COPY['setup.biz.profileNote']).toBe('This also changes your booking page.');
  });

  it('fills placeholders and uses the singular for one', () => {
    expect(setupT('setup.card.progress', { done: 4, total: 7 })).toBe('4 of 7 done');
    expect(setupT('setup.stepCount', { n: 3, total: 9 })).toBe('Step 3 of 9');
    expect(setupT('setup.products.quick.save', { count: 2 })).toBe('Add 2 products');
    expect(setupT('setup.products.quick.save', { count: 1 })).toBe('Add 1 product');
    expect(setupT('setup.cards.phone.ready', { name: 'Sam', device: 'iPhone' })).toBe("Sam's iPhone is ready to take cards");
    expect(setupT('setup.team.limit', { limit: 10 })).toBe('Most a team member can take off a sale: 10%');
  });

  it('has a card line for every step', () => {
    for (const id of POS_SETUP_STEPS) {
      expect(stepCardLabel(id)).toBeTruthy();
    }
    expect(stepCardLabel('cards')).toBe('Take cards on your phone');
    expect(stepCardLabel('practice')).toBe('Try a practice sale');
  });
});
