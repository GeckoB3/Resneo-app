import { fillCopy, type CopyVars } from '@/lib/pos/copy';

/**
 * The words of the customer's "Loyalty card" on Home, under the web's copy ids and word for word
 * from its deck (`src/lib/pos/loyalty/copy.ts`, UX spec §18.33). §21.4 asks for "the same card on
 * Home (`capp.home.loyalty`), in the same words" as the account's, and §13 has the app keep its own
 * copy file under the web's ids, so a copy handover can be checked against this one.
 *
 * `acct.loyalty.progress` and `acct.loyalty.reward` are in the settings deck too
 * (lib/pos/settings-more/loyalty-copy.ts), whose preview shows a venue what its clients see;
 * loyalty-copy.test.ts holds the two to the same words.
 *
 * `acct.loyalty.rewardExpires` ("Use it by {date}.") is not here, because the API sends that line
 * already filled (`expires_text`): the date is the reward's last day in the venue's time zone, and
 * the payload carries neither the expiry itself nor the zone.
 */
export const CUSTOMER_LOYALTY_COPY = {
  'capp.home.loyalty': 'Loyalty card',
  'acct.loyalty.progress': '{count} of {needed} visits at {venue}',
  'acct.loyalty.reward': 'Your reward is ready: {rewardText}. Just mention it when you pay.',
  'acct.loyalty.how': 'You get a stamp each day you visit {venue}.',
} as const;

export type CustomerLoyaltyCopyId = keyof typeof CUSTOMER_LOYALTY_COPY;

/** One line of the card, its `{placeholders}` filled. */
export function loyaltyCopy(id: CustomerLoyaltyCopyId, vars: CopyVars = {}): string {
  return fillCopy(CUSTOMER_LOYALTY_COPY[id], vars);
}
