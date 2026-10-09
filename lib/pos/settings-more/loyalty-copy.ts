import { fillText, type CopyVars } from './copy';
import type { LoyaltyRewardKind } from './types';

/**
 * Settings, Loyalty card, word for word from the web's `LOYALTY_COPY`
 * (src/lib/pos/loyalty/copy.ts, UX spec §18.33) and the words the web card writes inline
 * (src/app/dashboard/settings/checkout/LoyaltyCard.tsx). The few app-only lines are marked (app).
 * `{clients}` is the venue's client word, filled by the caller.
 */
export const LOYALTY_SET_COPY = {
  'set.loy.screen': 'Loyalty card set-up', // (app) the screen's header
  'set.loy.title': 'Loyalty card',
  'set.loy.help':
    'Reward {clients} who keep coming back. They get a stamp for each day they visit, and a reward when the card is full.',
  'set.loy.name': 'Name',
  'set.loy.name.default': 'Loyalty card',
  'set.loy.stamps': 'Visits to fill the card',
  'set.loy.stamps.help': 'One stamp per day they visit, however many services they have that day.',
  'set.loy.services': 'Which visits count',
  'set.loy.services.all': 'Any service',
  'set.loy.services.some': 'Only these services',
  'set.loy.reward': 'The reward',
  'set.loy.reward.free': 'A free service',
  'set.loy.reward.amount': 'An amount off',
  'set.loy.reward.percent': 'A percentage off',
  'set.loy.reward.chooseService': 'Choose a service', // web inline `<option value="">`
  'set.loy.validity': 'How long a reward lasts',
  'set.loy.validity.none': "Until it's used",
  'set.loy.validity.days': "{days} days after it's earned",
  'set.loy.validity.someDays': 'A number of', // web inline `{days}` before a number is chosen
  'set.loy.validity.daysLabel': 'Days', // web inline aria-label
  'set.loy.start': 'Start date',
  'set.loy.start.help':
    "Visits from this date earn stamps. Earlier visits, and visits you imported, don't. You can add stamps by hand to carry over paper cards.",
  'set.loy.email': 'Email {clients} when they earn a reward', // web inline Toggle label
  'set.loy.preview': 'How your {clients} see it',
  'set.loy.pause': 'Pause the card',
  'set.loy.pause.title': 'Pause the loyalty card?',
  'set.loy.pause.body': "Nobody earns stamps while it's paused. Rewards already earned can still be used.",
  'set.loy.paused': 'Paused. Nobody is earning stamps.',
  'set.loy.resume': 'Start again',
  'set.loy.change.note': "Changes apply from each card's next round. Stamps already on cards stay.",
  'set.loy.saved': 'Loyalty card saved.',
  'set.loy.loadError': "We couldn't load the loyalty card. Check your connection and try again.", // (app)
  'loyalty.reward.free': 'a free {serviceName}',
  'loyalty.reward.amount': '{amount} off',
  'loyalty.reward.percent': '{percent}% off',
  'acct.loyalty.progress': '{count} of {needed} visits at {venue}',
  'acct.loyalty.reward': 'Your reward is ready: {rewardText}. Just mention it when you pay.',
  'feat.loyalty.setup': 'Loyalty cards are ready to set up. Choose how many visits fill a card and what the reward is.',
  'feature.name': 'Loyalty', // (app) the gate's feature name ("Loyalty is switched off")
} as const;

export type LoyaltySetCopyId = keyof typeof LOYALTY_SET_COPY;

export function loyT(id: LoyaltySetCopyId, vars: CopyVars = {}): string {
  return fillText(LOYALTY_SET_COPY[id], vars);
}

export interface RewardShape {
  reward_kind: LoyaltyRewardKind;
  reward_service_name?: string | null;
  reward_amount_pence?: number | null;
  reward_percent_bps?: number | null;
}

/** `{rewardText}`: "a free Cut", "£5.00 off" or "10% off" (web `rewardText`). */
export function rewardText(r: RewardShape, money: (pence: number) => string): string {
  if (r.reward_kind === 'free_service') {
    return loyT('loyalty.reward.free', { serviceName: r.reward_service_name?.trim() || 'service' });
  }
  if (r.reward_kind === 'amount') return loyT('loyalty.reward.amount', { amount: money(r.reward_amount_pence ?? 0) });
  const pct = (r.reward_percent_bps ?? 0) / 100;
  return loyT('loyalty.reward.percent', { percent: Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0$/, '') });
}
