/**
 * Port of the web's `src/lib/referrals/explain-outcome.ts`: turns the
 * `void_reason` codes `/api/venue/referrals` sends into sentences. The app
 * printed the code itself, in red ("self_referral_same_email_domain").
 * Keep in step with the web file.
 */

export type ReferralUiStatus = 'pending' | 'referee_signed_up' | 'credited' | 'failed' | 'void';

/**
 * A sentence explaining the row, or null when the status label already says
 * enough (signed up, credited, pending).
 */
export function explainReferralOutcome(status: ReferralUiStatus, voidReason: string | null): string | null {
  if (status === 'void') {
    switch (voidReason) {
      case 'self_referral_same_email_domain':
        return 'Voided: the new venue signed up with the same business email domain as your venue, which our anti-abuse checks treat as a self-referral. Contact support if these are genuinely separate businesses and we will re-issue the credit.';
      case 'self_referral_same_card_fingerprint':
        return 'Voided: the new venue paid with the same payment card that is on file for your venue, which our anti-abuse checks treat as a self-referral. Contact support if these are genuinely separate businesses sharing card details and we will re-issue the credit.';
      case 'referrer_has_no_stripe_customer':
        return 'Voided: your venue had no Stripe customer record when the referee paid (this typically affects venues still on a Founding Partner plan). Once you move to a paid plan, contact support to claim this credit manually.';
      default:
        return 'Voided during anti-abuse checks. Contact support if you think this should have been credited.';
    }
  }
  if (status === 'failed') {
    if (voidReason === 'referee_subscription_cancelled') {
      return 'The referred venue cancelled their subscription before their first paid invoice, so no credit could be issued.';
    }
    return 'The referred venue did not convert to a paid plan, so no credit was issued.';
  }
  return null;
}
