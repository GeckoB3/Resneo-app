import type { PosT } from '@/lib/pos/copy';
import type { PosLoyaltyHistoryItem, PosLoyaltyReward, PosRewardKind } from '@/types/pos';

/**
 * Loyalty cards in the app (Pass LC, POS plan §4.34; UX spec §21.2, §21.3), following the web's
 * `src/lib/pos/loyalty/copy.ts` and `ClientLoyaltySection.tsx`: a reward in words, a history row
 * in words, the dates in the venue's time zone, and what the adjust form may send. Pure.
 */

export interface RewardShape {
  reward_kind: PosRewardKind;
  reward_service_name?: string | null;
  reward_amount_pence?: number | null;
  reward_percent_bps?: number | null;
}

/** `{rewardText}`: "a free Cut", "£5.00 off" or "10% off" (`loyalty.reward.*`). */
export function rewardText(r: RewardShape, t: PosT, money: (pence: number) => string): string {
  if (r.reward_kind === 'free_service') {
    return t('loyalty.reward.free', { serviceName: r.reward_service_name?.trim() || 'service' });
  }
  if (r.reward_kind === 'amount') return t('loyalty.reward.amount', { amount: money(r.reward_amount_pence ?? 0) });
  const pct = (r.reward_percent_bps ?? 0) / 100;
  return t('loyalty.reward.percent', { percent: Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0$/, '') });
}

/** The first letter capitalised, for a reward that starts a sentence. */
export function capitalised(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * A date as the card shows it ("3 October 2026"): a plain date as it is, an instant in the venue's
 * time zone. `endOfDay` reads an expiry instant as the day before it ends (the web's rule).
 */
export function loyaltyDay(value: string | null | undefined, timeZone: string, endOfDay = false): string {
  if (!value) return '';
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const at = plain ? Date.parse(`${value}T12:00:00Z`) : Date.parse(value) - (endOfDay ? 1000 : 0);
  if (Number.isNaN(at)) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: plain ? 'UTC' : timeZone,
    }).format(new Date(at));
  } catch {
    return '';
  }
}

/** One history row in words (`loyalty.h.*`). */
export function historyWords(h: PosLoyaltyHistoryItem, t: PosT, timeZone: string): string {
  switch (h.kind) {
    case 'earn':
      return t('loyalty.h.earn', { date: loyaltyDay(h.visit_date, timeZone) });
    case 'reverse':
      return t('loyalty.h.reverse', { date: loyaltyDay(h.visit_date, timeZone) });
    case 'adjust':
      return t(h.delta > 0 ? 'loyalty.h.adjust' : 'loyalty.h.adjust.remove', {
        count: Math.abs(h.delta),
        staffName: h.staff_name ?? 'a team member',
        reason: h.reason ?? '',
      });
    case 'spend':
      return t('loyalty.h.spend');
    case 'used':
      return t('loyalty.h.used', { saleNo: h.sale_number ?? '' });
    case 'expired':
      return t('loyalty.h.expired');
    case 'cancelled':
      return t('loyalty.h.cancelled');
    default:
      return '';
  }
}

/**
 * The adjust form's check (UX spec §21.2): 1 up to the stamps needed, a reason, and never taking
 * off more than the card holds (`loyalty.adjust.tooMany`). Returns the signed delta to send.
 */
export function adjustDelta(input: {
  direction: 'add' | 'remove';
  count: number;
  stamps: number;
  needed: number;
  reason: string;
}): { ok: true; delta: number } | { ok: false; tooMany: boolean } {
  const count = Math.round(input.count);
  if (!Number.isFinite(count) || count < 1 || count > Math.max(1, Math.min(20, input.needed))) return { ok: false, tooMany: false };
  if (input.direction === 'remove' && count > input.stamps) return { ok: false, tooMany: true };
  if (!input.reason.trim()) return { ok: false, tooMany: false };
  return { ok: true, delta: input.direction === 'add' ? count : -count };
}

/** The reward a full card just issued: the newest one waiting. */
export function newestReward(available: PosLoyaltyReward[]): PosLoyaltyReward | null {
  return available.length ? available[available.length - 1]! : null;
}
