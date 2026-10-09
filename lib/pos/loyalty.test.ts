/**
 * Loyalty cards in the app (Pass LC, UX spec §21.2, §21.3): a reward and a history row in words,
 * the venue-time dates, and the adjust form's check.
 */
import { posCopyFor } from '@/lib/pos/copy';
import { adjustDelta, capitalised, historyWords, loyaltyDay, rewardText } from '@/lib/pos/loyalty';

const t = posCopyFor('client');
const money = (p: number) => `£${(p / 100).toFixed(2)}`;

describe('a reward in words (`loyalty.reward.*`)', () => {
  it('reads a free service, an amount or a percentage', () => {
    expect(rewardText({ reward_kind: 'free_service', reward_service_name: 'Cut' }, t, money)).toBe('a free Cut');
    expect(rewardText({ reward_kind: 'amount', reward_amount_pence: 500 }, t, money)).toBe('£5.00 off');
    expect(rewardText({ reward_kind: 'percent', reward_percent_bps: 1000 }, t, money)).toBe('10% off');
    expect(rewardText({ reward_kind: 'percent', reward_percent_bps: 1250 }, t, money)).toBe('12.5% off');
    expect(capitalised('a free Cut')).toBe('A free Cut');
    expect(t('loyalty.apply.body', { rewardText: capitalised('a free Cut') })).toBe('A free Cut. Use it on this sale?');
  });
});

describe('the history', () => {
  it('words each row as the web does', () => {
    const base = { id: 'h', delta: 1, visit_date: '2026-10-03', staff_name: 'Sam', reason: 'Carried over from a paper card', sale_number: 1042, at: '2026-10-03T10:00:00Z' };
    expect(historyWords({ ...base, kind: 'earn' }, t, 'Europe/London')).toBe('Stamp for the visit on 3 October 2026');
    expect(historyWords({ ...base, kind: 'adjust', delta: 2 }, t, 'Europe/London')).toBe('2 stamps added by Sam: Carried over from a paper card');
    expect(historyWords({ ...base, kind: 'adjust', delta: -1 }, t, 'Europe/London')).toBe('1 stamps taken off by Sam: Carried over from a paper card');
    expect(historyWords({ ...base, kind: 'used' }, t, 'Europe/London')).toBe('Reward used on Sale 1042');
  });
  it('reads an expiry as the day before it ends, in the venue time zone', () => {
    expect(loyaltyDay('2026-11-01T00:00:00Z', 'Europe/London', true)).toBe('31 October 2026');
    expect(loyaltyDay(null, 'Europe/London')).toBe('');
  });
});

describe('adding or removing stamps', () => {
  it('sends a signed count with a reason, and never takes off more than the card holds', () => {
    expect(adjustDelta({ direction: 'add', count: 2, stamps: 0, needed: 6, reason: 'Paper card' })).toEqual({ ok: true, delta: 2 });
    expect(adjustDelta({ direction: 'remove', count: 2, stamps: 3, needed: 6, reason: 'Mistake' })).toEqual({ ok: true, delta: -2 });
    expect(adjustDelta({ direction: 'remove', count: 4, stamps: 3, needed: 6, reason: 'Mistake' })).toEqual({ ok: false, tooMany: true });
    expect(adjustDelta({ direction: 'add', count: 1, stamps: 0, needed: 6, reason: '  ' })).toEqual({ ok: false, tooMany: false });
    expect(adjustDelta({ direction: 'add', count: 7, stamps: 0, needed: 6, reason: 'x' })).toEqual({ ok: false, tooMany: false });
  });
});
