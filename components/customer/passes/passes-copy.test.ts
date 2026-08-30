/**
 * C3: the sentences about money and dates.
 *
 * The web's own finding was that the membership cancellation was the one with
 * NOTHING: one tap scheduled it, the only warning was the button's own label,
 * and the message afterwards read "Cancellation scheduled at period end", which
 * names no period and no end. The date lived in a different line of the same
 * row with nothing tying the two together, so a customer could not tell whether
 * they had just lost the classes they had already paid for.
 *
 * These read the strings, because a dialog that opens and says the wrong thing
 * passes any test that only asks whether a dialog opened.
 */
import {
  courseCancelConsequence,
  membershipCancelConsequence,
  membershipStateLine,
  recurringLine,
} from '@/components/customer/passes/passes-copy';
import type { Membership } from '@/lib/queries/useCustomerPasses';

const BASE: Membership = {
  id: 'm-1',
  venue_id: 'v-1',
  product_id: 'p-1',
  status: 'active',
  cancel_at_period_end: false,
  current_period_end: '2026-09-14T00:00:00.000Z',
  stripe_subscription_id: 'sub_1',
};

const m = (o: Partial<Membership> = {}): Membership => ({ ...BASE, ...o });

describe('what a membership says about itself', () => {
  it('names the date it renews', async () => {
    expect(membershipStateLine(m())).toMatch(/renews on 14 September 2026/i);
  });

  it('names the date it ENDS when a cancellation is pending, not just that one exists', async () => {
    /*
      The defect the web fixed. Without the date, a customer cannot tell whether
      they have lost what they already paid for, and the safest assumption they
      make is the wrong one: they stop booking.
    */
    const line = membershipStateLine(m({ cancel_at_period_end: true }));
    expect(line).toMatch(/14 September 2026/);
    expect(line).toMatch(/still use it until then/i);
  });

  it('says a failed payment plainly, because only the customer can fix it', async () => {
    expect(membershipStateLine(m({ status: 'past_due' }))).toMatch(/did not go through/i);
  });

  it('does not invent a date it was not given', async () => {
    // A missing period end is a gap in the data, not a reason to guess.
    const line = membershipStateLine(m({ cancel_at_period_end: true, current_period_end: null }));
    expect(line).toMatch(/end of this period/i);
    expect(line).not.toMatch(/\d{4}/);
  });

  it('survives an unparseable date rather than printing Invalid Date', async () => {
    expect(membershipStateLine(m({ current_period_end: 'not-a-date' }))).not.toMatch(/invalid/i);
  });
});

describe('what cancelling a membership costs', () => {
  it('says it stays usable until the named date', async () => {
    const text = membershipCancelConsequence(m());
    expect(text).toMatch(/stays active until 14 September 2026/i);
    expect(text).toMatch(/stops after that/i);
  });

  it('promises the change of mind, which is why resume exists', async () => {
    // The web added the resume route precisely so this promise could be kept.
    // Before it, the only remedy was ringing the venue.
    expect(membershipCancelConsequence(m())).toMatch(/change your mind/i);
  });

  it('degrades to a true sentence when there is no date', async () => {
    const text = membershipCancelConsequence(m({ current_period_end: null }));
    expect(text).toMatch(/end of the period you have paid for/i);
  });
});

describe('what leaving a course costs', () => {
  it('names a refund WITHOUT naming a figure', async () => {
    /*
      The amount is prorated server-side at cancel time from the sessions still
      to come. A number printed here would sometimes disagree with the one the
      customer is actually given, and a wrong number about money is worse than
      no number.
    */
    const text = courseCancelConsequence();
    expect(text).toMatch(/refund/i);
    expect(text).not.toMatch(/[£$]|\d+\s*(pounds|p\b)/i);
  });

  it('says the remaining sessions are given up', async () => {
    expect(courseCancelConsequence()).toMatch(/remaining sessions/i);
  });
});

describe('when a weekly class happens', () => {
  it('names the day and time', async () => {
    expect(recurringLine(2, '18:30:00')).toBe('Every Tuesday at 18:30.');
  });

  it('handles SUNDAY, which is day zero', async () => {
    /*
      The falsy-zero trap. A truthiness check on the day would describe every
      Sunday class as "repeats weekly", which is the one day of the week this
      would silently get wrong.
    */
    expect(recurringLine(0, '09:00:00')).toBe('Every Sunday at 09:00.');
  });

  it('says something true when the day is missing', async () => {
    expect(recurringLine(null, '18:30:00')).toBe('Every week at 18:30.');
    expect(recurringLine(null, null)).toBe('Repeats weekly.');
  });
});

describe('the house style', () => {
  it('uses no em-dashes anywhere in customer copy', async () => {
    const all = [
      membershipStateLine(m()),
      membershipStateLine(m({ cancel_at_period_end: true })),
      membershipStateLine(m({ status: 'past_due' })),
      membershipStateLine(m({ status: 'trialing' })),
      membershipCancelConsequence(m()),
      courseCancelConsequence(),
      recurringLine(2, '18:30:00'),
    ].join(' ');
    expect(all).not.toContain('—');
  });
});
