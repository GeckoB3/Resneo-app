import { smsUsageOverageLine, smsUsagePercent } from '@/lib/reports/sms-usage';

describe('SMS usage card', () => {
  it('fills the bar by the share of the allowance used, capped at full', () => {
    expect(smsUsagePercent({ messages_sent: 50, messages_included: 200 })).toBe(25);
    expect(smsUsagePercent({ messages_sent: 300, messages_included: 200 })).toBe(100);
    expect(smsUsagePercent({ messages_sent: 5, messages_included: 0 })).toBe(0);
  });

  it('says nothing about overage inside the allowance', () => {
    expect(smsUsageOverageLine({ overage_count: 0, overage_amount_pence: 0, billable_unit_gbp: 0.05 })).toBeNull();
  });

  it('prices the overage as the web does', () => {
    expect(smsUsageOverageLine({ overage_count: 12, overage_amount_pence: 60, billable_unit_gbp: 0.05 })).toBe(
      '12 SMS segments beyond your included allowance, about £0.60 at £0.05 each. Overage is metered against the current Stripe subscription period.',
    );
  });
});
