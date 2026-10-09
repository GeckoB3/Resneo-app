/**
 * Checkout's words follow the house rules (CLAUDE.md, UX spec §18): no em-dash anywhere, straight
 * apostrophes only, and the venue's client word is filled in.
 */
import { capitalise, fillCopy, POS_COPY, posCopy, posCopyFor } from '@/lib/pos/copy';

describe('POS copy', () => {
  const entries = Object.entries(POS_COPY);

  it('never uses an em-dash', () => {
    const EM_DASH = String.fromCharCode(0x2014);
    const offenders = entries.filter(([, text]) => text.includes(EM_DASH)).map(([id]) => id);
    expect(offenders).toEqual([]);
  });

  it('uses straight apostrophes and quotes', () => {
    const curly = [0x2018, 0x2019, 0x201c, 0x201d].map((c) => String.fromCharCode(c));
    const offenders = entries.filter(([, text]) => curly.some((c) => text.includes(c))).map(([id]) => id);
    expect(offenders).toEqual([]);
  });

  it('never writes a currency symbol next to a money placeholder', () => {
    const offenders = entries.filter(([, text]) => /£\{/.test(text)).map(([id]) => id);
    expect(offenders).toEqual([]);
  });

  it('keeps the web ids the spec names for app step 1', () => {
    const ids = ['app.tile.checkout', 'till.newSale', 'bk.checkout', 'app.mine.title', 'app.receipt.notSent.pos', 'app.charge.timedOut'] as const;
    for (const id of ids) expect(POS_COPY[id]).toBeTruthy();
  });

  it('fills placeholders and leaves unknown ones for a test to spot', () => {
    expect(fillCopy('{amount} to pay', { amount: '£5.00' })).toBe('£5.00 to pay');
    expect(fillCopy('{missing} here')).toBe('{missing} here');
    expect(posCopy('sale.title', { saleNo: 'R-12' })).toBe('Sale R-12');
  });

  it("fills the venue's own client word, in both cases", () => {
    const t = posCopyFor('Patient');
    expect(t('client.add')).toBe('Add patient');
    expect(t('app.sale.client')).toBe('Patient');
    expect(capitalise('guest')).toBe('Guest');
  });
});
