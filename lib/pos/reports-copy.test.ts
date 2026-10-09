/**
 * Reports' POS words follow the house rules (CLAUDE.md): no em-dash anywhere, straight apostrophes,
 * no currency symbol before a money placeholder, and nothing that singles out one country.
 */
import { REPORTS_COPY, reportsCopy } from '@/lib/pos/reports-copy';

describe('Reports POS copy', () => {
  const entries = Object.entries(REPORTS_COPY);

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

  it('does not single out one country', () => {
    expect(entries.filter(([, text]) => /northern ireland|great britain|\bHMRC\b/i.test(text)).map(([id]) => id)).toEqual([]);
  });

  it('keeps the web words for the commission and voucher reports', () => {
    expect(reportsCopy('rep.c.lines', { staffName: 'Sam' })).toBe("Sam's sales");
    expect(reportsCopy('rep.c.changed', { date: '9 October 2026' })).toBe('Changed since you exported it on 9 October 2026');
    expect(reportsCopy('rep.v.outstanding')).toBe('Still to be spent');
    expect(reportsCopy('vimp.summary', { count: 3, amount: '£75.00', problems: 1 })).toBe(
      '3 vouchers to add, worth £75.00 in total. 1 rows have problems.',
    );
  });
});
