/**
 * An open sale's "Started by ... at {time}" names the day when it was not today (web
 * `formatTillTimeWithDay`): a sale left open days before read as later today (phone QA 2026-11-21).
 */
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

import { timeOf } from '@/components/pos/CheckoutHome';

describe('timeOf', () => {
  const now = new Date(2026, 10, 21, 17, 0);

  it('is the time alone for today', () => {
    expect(timeOf(new Date(2026, 10, 21, 9, 5).toISOString(), now)).toBe('09:05');
  });

  it('names the day for another day', () => {
    expect(timeOf(new Date(2026, 10, 18, 18, 57).toISOString(), now)).toBe('18:57 on 18 Nov');
  });

  it('is empty without a time', () => {
    expect(timeOf(null, now)).toBe('');
  });
});
