/**
 * Cached Intl.DateTimeFormat factory.
 *
 * Constructing a formatter is the expensive part, especially with a timeZone,
 * and the app built them in render bodies and per-row helpers. Caching is only
 * safe if the key covers everything that changes the output — a collision would
 * silently format a date in the wrong zone, which is far worse than the cost it
 * saves. These tests pin identity (that reuse happens) AND correctness (that
 * different options never share an instance).
 */
import { __clearDateTimeFormatCache, getDateTimeFormat } from '@/lib/dates/formatters';

const LONDON = { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' } as const;

beforeEach(() => __clearDateTimeFormatCache());

describe('getDateTimeFormat', () => {
  it('returns the SAME instance for identical options', () => {
    const a = getDateTimeFormat('en-CA', { ...LONDON });
    const b = getDateTimeFormat('en-CA', { ...LONDON });
    expect(a).toBe(b);
  });

  it('does not share an instance across locales', () => {
    expect(getDateTimeFormat('en-CA', { ...LONDON })).not.toBe(
      getDateTimeFormat('en-GB', { ...LONDON }),
    );
  });

  it('does not share an instance across time zones', () => {
    const london = getDateTimeFormat('en-CA', { ...LONDON });
    const tokyo = getDateTimeFormat('en-CA', { ...LONDON, timeZone: 'Asia/Tokyo' });
    expect(london).not.toBe(tokyo);
  });

  it('formats the same as a freshly constructed formatter', () => {
    const when = new Date('2026-08-09T23:30:00.000Z');
    const options: Intl.DateTimeFormatOptions = { ...LONDON };
    expect(getDateTimeFormat('en-CA', options).format(when)).toBe(
      new Intl.DateTimeFormat('en-CA', options).format(when),
    );
  });

  it('keeps time zones apart in the OUTPUT, not just by identity', () => {
    // 23:30 UTC is already the 10th in Tokyo and still the 10th in London (BST).
    const when = new Date('2026-08-09T23:30:00.000Z');
    const tokyo = getDateTimeFormat('en-CA', { ...LONDON, timeZone: 'Asia/Tokyo' }).format(when);
    const utc = getDateTimeFormat('en-CA', { ...LONDON, timeZone: 'UTC' }).format(when);
    expect(tokyo).toBe('2026-08-10');
    expect(utc).toBe('2026-08-09');
  });

  it('separates formatters differing only in a single option', () => {
    const twoDigit = getDateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', hour12: false });
    const twelveHour = getDateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', hour12: true });
    expect(twoDigit).not.toBe(twelveHour);
  });

  it('caches across call sites that build the options object separately', () => {
    // The real win: two modules passing equivalent literals share one instance.
    const fromA = getDateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const fromB = getDateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    expect(fromA).toBe(fromB);
  });
});
