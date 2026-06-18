/**
 * Plan, pricing, and allowance constants mirrored from the web app.
 * Keep in sync with:
 * @see _reference/Resneo/src/lib/pricing-constants.ts
 * @see _reference/Resneo/src/lib/plan-limits.ts
 * @see _reference/Resneo/src/lib/billing/sms-allowance.ts
 * @see _reference/Resneo/src/lib/subscription-cancellation-copy.ts
 */

export type AppointmentsTier = 'light' | 'plus' | 'appointments';

export const APPOINTMENTS_TIERS: AppointmentsTier[] = ['light', 'plus', 'appointments'];

export const APPOINTMENTS_TIER_ORDER: Record<AppointmentsTier, number> = {
  light: 0,
  plus: 1,
  appointments: 2,
};

export function isAppointmentsTier(tier: string | null | undefined): tier is AppointmentsTier {
  return tier === 'light' || tier === 'plus' || tier === 'appointments';
}

/** Flat monthly prices (GBP) — web pricing-constants.ts. */
export const APPOINTMENTS_LIGHT_PRICE = 20;
export const APPOINTMENTS_PLUS_PRICE = 49;
export const APPOINTMENTS_PRO_PRICE = 99;
export const RESTAURANT_PRICE = 79;

/** Guest SMS after included monthly allowance (Stripe metered usage), per segment. */
export const SMS_OVERAGE_GBP_PER_MESSAGE = 0.06;

/** Public subscription cancellation wording aligned with Website Terms of Use §4. */
export const SUBSCRIPTION_CANCELLATION_PUBLIC_NOTICE =
  'Cancel anytime by giving 30 days’ notice. Your subscription remains active until the end of the notice period.';

/** User-visible plan name from `venues.pricing_tier` (lowercase). */
export function planDisplayName(pricingTier: string | null | undefined): string {
  const t = (pricingTier ?? '').toLowerCase().trim();
  switch (t) {
    case 'light':
      return 'Appointments Light';
    case 'plus':
      return 'Appointments Plus';
    case 'appointments':
      return 'Appointments Pro';
    case 'restaurant':
      return 'Restaurant';
    case 'founding':
      return 'Founding Partner';
    case '':
      return '—';
    default:
      return t.charAt(0).toUpperCase() + t.slice(1);
  }
}

/** Published listing price label — web SettingsView planPriceLabel(). */
export function planPriceLabel(pricingTier: string | null | undefined): string {
  const t = (pricingTier ?? '').toLowerCase().trim();
  if (t === 'light') return `£${APPOINTMENTS_LIGHT_PRICE}/month`;
  if (t === 'plus') return `£${APPOINTMENTS_PLUS_PRICE}/month`;
  if (t === 'appointments') return `£${APPOINTMENTS_PRO_PRICE}/month`;
  if (t === 'restaurant' || t === 'founding') return `£${RESTAURANT_PRICE}/month`;
  return `£${APPOINTMENTS_PRO_PRICE}/month`;
}

/** Bookable calendar cap by tier — web plan-limits.ts. Infinity = no cap. */
export function planCalendarLimit(pricingTier: string | null | undefined): number {
  const t = (pricingTier ?? '').toLowerCase().trim();
  if (t === 'light') return 1;
  if (t === 'plus') return 5;
  return Infinity;
}

/**
 * Staff-login (seat) cap by tier — web `plan-limits.ts planStaffLimit`.
 * Light = 1, Plus = 5, everything else (Pro/restaurant/founding) = unlimited.
 * Infinity means no cap. Keep in sync with the web enforcement.
 */
export function planStaffLimit(pricingTier: string | null | undefined): number {
  const t = (pricingTier ?? '').toLowerCase().trim();
  if (t === 'light') return 1;
  if (t === 'plus') return 5;
  return Infinity;
}

/** Included SMS segments per month by tier — web sms-allowance.ts. */
export function smsMonthlyAllowance(pricingTier: string | null | undefined): number {
  const t = (pricingTier ?? '').toLowerCase().trim();
  if (t === 'light') return 100;
  if (t === 'plus') return 250;
  if (t === 'restaurant' || t === 'founding') return 500;
  return 500;
}

/** Marketing inclusions per Appointments tier — web APPOINTMENTS_PLAN_DETAILS. */
export const APPOINTMENTS_PLAN_DETAILS: Record<
  AppointmentsTier,
  { price: number; calendars: string; team: string; sms: string }
> = {
  light: {
    price: APPOINTMENTS_LIGHT_PRICE,
    calendars: '1 bookable calendar',
    team: '1 team login',
    sms: '100 included SMS per month',
  },
  plus: {
    price: APPOINTMENTS_PLUS_PRICE,
    calendars: 'Up to 5 bookable calendars',
    team: 'Up to 5 team logins',
    sms: '250 included SMS per month',
  },
  appointments: {
    price: APPOINTMENTS_PRO_PRICE,
    calendars: 'Unlimited bookable calendars',
    team: 'Unlimited team logins',
    sms: '500 included SMS per month',
  },
};
