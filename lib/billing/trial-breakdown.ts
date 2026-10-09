/**
 * The free-trial countdown and its breakdown on Plan & payments, web parity with
 * `TrialBreakdownBanner` in `src/app/dashboard/settings/SettingsView.tsx` and
 * `src/lib/billing/trial-info.ts` (`VenueTrialBreakdown`, `computeTrialBreakdown`).
 *
 * The web reads the referral row on the server (as the referred venue), which RLS keeps from the
 * app. So the breakdown comes from `trial_breakdown` on `GET /api/venue/billing/status` when the
 * server sends it. Until it does, the app works out what the billing window alone proves: the
 * countdown, the first charge date, and the breakdown only where the window is the standard
 * trial and nothing else, so no referral bonus is ever left out of a total.
 */

/** Always the standard signup trial (web `SIGNUP_TRIAL_DAYS`). */
export const SIGNUP_TRIAL_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Web `VenueTrialBreakdown`, as the server would send it. */
export interface VenueTrialBreakdown {
  isTrialing: boolean;
  trialStartIso: string | null;
  trialEndIso: string | null;
  daysRemaining: number;
  totalDays: number;
  standardDays: number;
  referralBonusDays: number;
  referrerVenueName: string | null;
  hasReferralAttached: boolean;
}

export interface TrialBannerView {
  /** "12 days of free trial remaining." */
  headline: string;
  /** "First charge on 21 October 2026.", or null without a readable end date. */
  firstCharge: string | null;
  /** The breakdown parts, or null when the app cannot vouch for one. */
  breakdown: {
    standardDays: number;
    referralBonusDays: number;
    referrerLabel: string;
    totalDays: number;
  } | null;
  /** The referral colours (green) on the web when a bonus applied. */
  hasReferralBonus: boolean;
}

function wholeDaysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.round((to - from) / MS_PER_DAY));
}

/** Whole days until the end, 0 once it has passed (web: recomputed against the clock). */
export function trialDaysRemaining(trialEndIso: string | null | undefined, nowMs: number): number {
  if (!trialEndIso) return 0;
  const target = Date.parse(trialEndIso);
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - nowMs) / MS_PER_DAY));
}

export function trialHeadline(daysRemaining: number): string {
  if (daysRemaining === 0) return 'Your free trial ends today.';
  if (daysRemaining === 1) return '1 day of free trial remaining.';
  return `${daysRemaining} days of free trial remaining.`;
}

function firstChargeLine(trialEndIso: string | null): string | null {
  if (!trialEndIso) return null;
  const ms = Date.parse(trialEndIso);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return `First charge on ${date}.`;
}

/**
 * What the trial banner shows, or null when the venue is not trialling.
 *
 * `server` is the status route's `trial_breakdown` when present; otherwise the plan status and
 * billing window build the same view, with the breakdown only when the window is plainly the
 * standard 14 days (a longer one holds a bonus the app cannot name).
 */
export function trialBannerView(input: {
  planStatus: string | null | undefined;
  periodStart: string | null | undefined;
  periodEnd: string | null | undefined;
  server?: VenueTrialBreakdown | null;
  nowMs: number;
}): TrialBannerView | null {
  const server = input.server ?? null;
  const isTrialing = server ? server.isTrialing : (input.planStatus ?? '').toLowerCase() === 'trialing';
  const trialEndIso = server ? server.trialEndIso : (input.periodEnd ?? null);
  if (!isTrialing || !trialEndIso) return null;

  const daysRemaining = trialDaysRemaining(trialEndIso, input.nowMs);
  const headline = trialHeadline(
    Number.isFinite(Date.parse(trialEndIso)) ? daysRemaining : (server?.daysRemaining ?? 0),
  );
  const firstCharge = firstChargeLine(trialEndIso);

  if (server) {
    const hasReferralBonus = server.referralBonusDays > 0;
    return {
      headline,
      firstCharge,
      breakdown: {
        standardDays: server.standardDays,
        referralBonusDays: server.referralBonusDays,
        referrerLabel: server.referrerVenueName?.trim() || 'a ResNeo customer',
        totalDays: server.totalDays,
      },
      hasReferralBonus,
    };
  }

  const observed =
    input.periodStart && trialEndIso ? wholeDaysBetween(input.periodStart, trialEndIso) : null;
  const plainStandard = observed !== null && observed > 0 && observed <= SIGNUP_TRIAL_DAYS;
  return {
    headline,
    firstCharge,
    breakdown: plainStandard
      ? { standardDays: SIGNUP_TRIAL_DAYS, referralBonusDays: 0, referrerLabel: '', totalDays: SIGNUP_TRIAL_DAYS }
      : null,
    hasReferralBonus: false,
  };
}

/** The breakdown sentence in one string (the banner bolds the figures). */
export function trialBreakdownSentence(b: NonNullable<TrialBannerView['breakdown']>): string {
  const bonus = b.referralBonusDays > 0 ? ` + ${b.referralBonusDays} days from referral by ${b.referrerLabel}` : '';
  const total = b.totalDays > 0 ? ` = ${b.totalDays} days total.` : '.';
  return `Trial breakdown: ${b.standardDays} days standard signup trial${bonus}${total}`;
}
