/**
 * Resume-subscription outcome (R12-3).
 *
 * The web change (resneo#129) let `resume_subscription` fall back to a Stripe
 * Checkout session for a NEW subscription when the old one is past reviving,
 * returning `{ redirect_url }` and NO `message`. The screen treated every
 * success as a resume, so that path printed "Your subscription will continue."
 * over a resume that never happened — and, on a native build, would have opened
 * Checkout for a subscription purchase, which the reader-app posture forbids.
 */
import { resolveResumeSubscriptionOutcome } from '@/lib/billing/resume-subscription-outcome';

const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_123';

describe('resolveResumeSubscriptionOutcome', () => {
  describe('genuine resume (no redirect_url)', () => {
    it('uses the server message when there is one', () => {
      const out = resolveResumeSubscriptionOutcome(
        { message: 'Subscription resumed.' },
        { manageOnWeb: false },
      );
      expect(out).toEqual({ kind: 'resumed', message: 'Subscription resumed.' });
    });

    it('falls back to default copy when the server sends none', () => {
      const out = resolveResumeSubscriptionOutcome({}, { manageOnWeb: false });
      expect(out).toEqual({ kind: 'resumed', message: 'Your subscription will continue.' });
    });

    it('stays in-app on native — a resume is not a purchase', () => {
      const out = resolveResumeSubscriptionOutcome({ message: 'Resumed.' }, { manageOnWeb: true });
      expect(out.kind).toBe('resumed');
    });

    it('treats a blank message as absent', () => {
      const out = resolveResumeSubscriptionOutcome({ message: '   ' }, { manageOnWeb: false });
      expect(out).toEqual({ kind: 'resumed', message: 'Your subscription will continue.' });
    });

    it('handles a null/undefined response without throwing', () => {
      expect(resolveResumeSubscriptionOutcome(null, { manageOnWeb: false }).kind).toBe('resumed');
      expect(resolveResumeSubscriptionOutcome(undefined, { manageOnWeb: true }).kind).toBe('resumed');
    });
  });

  describe('subscription was past reviving (redirect_url present)', () => {
    it('is NEVER reported as a resume — that was the bug', () => {
      const out = resolveResumeSubscriptionOutcome(
        { redirect_url: CHECKOUT_URL },
        { manageOnWeb: false },
      );
      expect(out.kind).not.toBe('resumed');
      expect(out.message).not.toBe('Your subscription will continue.');
    });

    it('opens Checkout where in-app purchases are allowed', () => {
      const out = resolveResumeSubscriptionOutcome(
        { redirect_url: CHECKOUT_URL },
        { manageOnWeb: false },
      );
      expect(out).toEqual({
        kind: 'checkout',
        url: CHECKOUT_URL,
        message: expect.stringContaining('Complete checkout in the browser'),
      });
    });

    it('routes to the web dashboard on a native storefront (Apple 3.1.1)', () => {
      const out = resolveResumeSubscriptionOutcome(
        { redirect_url: CHECKOUT_URL },
        { manageOnWeb: true },
      );
      expect(out.kind).toBe('purchase_on_web');
      // The Checkout URL must not travel with it: nothing may open Stripe here.
      expect(JSON.stringify(out)).not.toContain('checkout.stripe.com');
    });

    it('ignores a whitespace-only redirect_url (still a plain resume)', () => {
      const out = resolveResumeSubscriptionOutcome(
        { redirect_url: '   ', message: 'Resumed.' },
        { manageOnWeb: true },
      );
      expect(out).toEqual({ kind: 'resumed', message: 'Resumed.' });
    });

    it('prefers the purchase path over any message the server did send', () => {
      const out = resolveResumeSubscriptionOutcome(
        { redirect_url: CHECKOUT_URL, message: 'Your subscription will continue.' },
        { manageOnWeb: false },
      );
      expect(out.kind).toBe('checkout');
    });
  });
});
