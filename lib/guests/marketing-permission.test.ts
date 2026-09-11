import {
  hasMarketingPermission,
  marketingPermissionSummary,
  marketingSkipReason,
  marketingSummaryHint,
} from '@/lib/guests/marketing-permission';

/** Consent AND no opt-out, so an old consent never outlives an unsubscribe. */
describe('hasMarketingPermission', () => {
  it('needs a recorded consent', () => {
    expect(hasMarketingPermission({ marketing_consent: false, marketing_opt_out: false })).toBe(false);
    expect(hasMarketingPermission({})).toBe(false);
  });

  it('is withdrawn by an opt-out even with consent on file', () => {
    expect(hasMarketingPermission({ marketing_consent: true, marketing_opt_out: true })).toBe(false);
  });

  it('holds with consent and no opt-out', () => {
    expect(hasMarketingPermission({ marketing_consent: true, marketing_opt_out: false })).toBe(true);
    expect(hasMarketingPermission({ marketing_consent: true })).toBe(true);
  });
});

describe('marketingSkipReason / summary', () => {
  it('names the opt-out first, then the missing consent, then nothing', () => {
    expect(marketingSkipReason({ marketing_consent: true, marketing_opt_out: true })).toBe('Opted out of marketing');
    expect(marketingSkipReason({ marketing_consent: false })).toBe('No marketing permission on file');
    expect(marketingSkipReason({ marketing_consent: true })).toBeNull();
    expect(marketingPermissionSummary({ marketing_consent: true })).toBe('Receives marketing messages.');
    expect(marketingPermissionSummary({ marketing_opt_out: true })).toBe('Does not receive marketing messages.');
  });
});

/** The collapsed card's hint — the web says "Subscribed", never "Consented". */
describe('marketingSummaryHint', () => {
  it('reads the three states in the web’s words', () => {
    expect(marketingSummaryHint({ marketing_consent: true, marketing_opt_out: true })).toBe('Opted out');
    expect(marketingSummaryHint({ marketing_opt_out: true })).toBe('Opted out');
    expect(marketingSummaryHint({ marketing_consent: true })).toBe('Subscribed');
    expect(marketingSummaryHint({})).toBe('No consent');
  });
});
