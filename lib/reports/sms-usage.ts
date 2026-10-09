/**
 * Copy and maths for the Reports "SMS segments this period" card, web parity with
 * `src/app/dashboard/reports/SmsUsageBanner.tsx`.
 */
import type { SmsUsageDisplay } from '@/lib/queries/useSmsUsage';

/** How full the included allowance is, 0 to 100. An allowance of 0 draws an empty bar. */
export function smsUsagePercent(usage: Pick<SmsUsageDisplay, 'messages_sent' | 'messages_included'>): number {
  if (usage.messages_included <= 0) return 0;
  return Math.max(0, Math.min(100, (usage.messages_sent / usage.messages_included) * 100));
}

/** The overage note, or null while the venue is inside its allowance. */
export function smsUsageOverageLine(
  usage: Pick<SmsUsageDisplay, 'overage_count' | 'overage_amount_pence' | 'billable_unit_gbp'>,
): string | null {
  if (usage.overage_count <= 0) return null;
  const amount = (usage.overage_amount_pence / 100).toFixed(2);
  const unit = usage.billable_unit_gbp.toFixed(2);
  return `${usage.overage_count} SMS segments beyond your included allowance, about £${amount} at £${unit} each. Overage is metered against the current Stripe subscription period.`;
}
