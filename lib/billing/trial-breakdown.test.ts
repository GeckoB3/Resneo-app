import {
  trialBannerView,
  trialBreakdownSentence,
  trialDaysRemaining,
  trialHeadline,
  type VenueTrialBreakdown,
} from '@/lib/billing/trial-breakdown';

const NOW = Date.parse('2026-10-09T12:00:00Z');

const server = (over: Partial<VenueTrialBreakdown> = {}): VenueTrialBreakdown => ({
  isTrialing: true,
  trialStartIso: '2026-09-30T12:00:00Z',
  trialEndIso: '2026-11-13T12:00:00Z',
  daysRemaining: 35,
  totalDays: 44,
  standardDays: 14,
  referralBonusDays: 30,
  referrerVenueName: 'Bright Cuts',
  hasReferralAttached: true,
  ...over,
});

describe('trial countdown', () => {
  it('counts whole days up to the end, and none once it has passed', () => {
    expect(trialDaysRemaining('2026-10-12T12:00:00Z', NOW)).toBe(3);
    expect(trialDaysRemaining('2026-10-09T13:00:00Z', NOW)).toBe(1);
    expect(trialDaysRemaining('2026-10-08T12:00:00Z', NOW)).toBe(0);
    expect(trialDaysRemaining(null, NOW)).toBe(0);
  });

  it('reads as the web does', () => {
    expect(trialHeadline(0)).toBe('Your free trial ends today.');
    expect(trialHeadline(1)).toBe('1 day of free trial remaining.');
    expect(trialHeadline(12)).toBe('12 days of free trial remaining.');
  });
});

describe('trial banner', () => {
  it('is not shown outside a trial', () => {
    expect(trialBannerView({ planStatus: 'active', periodStart: null, periodEnd: '2026-11-01T00:00:00Z', nowMs: NOW })).toBeNull();
    expect(trialBannerView({ planStatus: 'trialing', periodStart: null, periodEnd: null, nowMs: NOW })).toBeNull();
  });

  it('names the referral bonus and who gave it when the server sends the breakdown', () => {
    const view = trialBannerView({ planStatus: 'trialing', periodStart: null, periodEnd: null, server: server(), nowMs: NOW })!;
    expect(view.headline).toBe('35 days of free trial remaining.');
    expect(view.firstCharge).toBe('First charge on 13 November 2026.');
    expect(view.hasReferralBonus).toBe(true);
    expect(trialBreakdownSentence(view.breakdown!)).toBe(
      'Trial breakdown: 14 days standard signup trial + 30 days from referral by Bright Cuts = 44 days total.',
    );
  });

  it('falls back to "a ResNeo customer" for a referrer with no name', () => {
    const view = trialBannerView({
      planStatus: 'trialing',
      periodStart: null,
      periodEnd: null,
      server: server({ referrerVenueName: null }),
      nowMs: NOW,
    })!;
    expect(view.breakdown!.referrerLabel).toBe('a ResNeo customer');
  });

  it('shows the standard breakdown from a plain 14-day window', () => {
    const view = trialBannerView({
      planStatus: 'trialing',
      periodStart: '2026-10-01T12:00:00Z',
      periodEnd: '2026-10-15T12:00:00Z',
      nowMs: NOW,
    })!;
    expect(view.headline).toBe('6 days of free trial remaining.');
    expect(view.hasReferralBonus).toBe(false);
    expect(trialBreakdownSentence(view.breakdown!)).toBe('Trial breakdown: 14 days standard signup trial = 14 days total.');
  });

  it('leaves the breakdown out of a longer window it cannot explain, rather than miscount it', () => {
    const view = trialBannerView({
      planStatus: 'trialing',
      periodStart: '2026-09-30T12:00:00Z',
      periodEnd: '2026-11-13T12:00:00Z',
      nowMs: NOW,
    })!;
    expect(view.headline).toBe('35 days of free trial remaining.');
    expect(view.breakdown).toBeNull();
  });

  it('has no em-dash in any line', () => {
    const view = trialBannerView({ planStatus: 'trialing', periodStart: null, periodEnd: null, server: server(), nowMs: NOW })!;
    expect(`${view.headline}${view.firstCharge}${trialBreakdownSentence(view.breakdown!)}`).not.toContain('—');
  });
});
