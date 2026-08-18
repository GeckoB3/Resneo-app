/**
 * What a service asks for online at booking time.
 *
 * A direct mirror of the web's `resolveAppointmentServiceOnlineCharge`
 * (`src/lib/appointments/appointment-service-payment.ts`). The app previously
 * had no equivalent and read `deposit_pence` directly wherever it needed to
 * know whether money was owed, which quietly excluded `full_payment` services:
 * they carry their amount in `price_pence`, so `deposit_pence > 0` is false for
 * them and the staff "Require deposit" control never appeared. Staff had no way
 * to take a pay-in-full service without charging for it.
 *
 * `chargeLabel: 'card_hold'` means NO money is due at booking: `amountPence` is
 * the no-show fee to authorise later. Callers must branch on the label rather
 * than treating every non-null result as a charge.
 */

export type AppointmentPaymentRequirement = 'none' | 'deposit' | 'full_payment' | 'card_hold';

export type AppointmentOnlineCharge =
  | { amountPence: number; chargeLabel: 'deposit' | 'full_payment' | 'card_hold' }
  | null;

/** Fields sufficient to resolve the charge (a catalog service, option row, or variant merge). */
export interface AppointmentChargeFields {
  price_pence?: number | null;
  /** The deposit, or the no-show fee when the requirement is 'card_hold'. */
  deposit_pence?: number | null;
  payment_requirement?: string | null;
}

/** One segment's resolved charge, as stamped on a `MultiServiceSegment`. */
export interface SegmentCharge {
  chargePence?: number | null;
  chargeLabel?: string | null;
}

/**
 * Effective payment mode, handling pre-migration rows that only had a deposit.
 *
 * `'card_hold'` is honoured only when set explicitly (design doc 6.3): the
 * legacy `deposit_pence > 0` inference always yields `'deposit'`, so an old row
 * can never resolve to a card hold the venue did not configure.
 */
export function resolveAppointmentPaymentRequirement(
  svc: Pick<AppointmentChargeFields, 'payment_requirement' | 'deposit_pence'>,
): AppointmentPaymentRequirement {
  const raw = svc.payment_requirement;
  if (raw === 'deposit' || raw === 'full_payment' || raw === 'none' || raw === 'card_hold') {
    return raw;
  }
  if (svc.deposit_pence != null && svc.deposit_pence > 0) return 'deposit';
  return 'none';
}

/** Amount to collect online at booking for this service. */
export function resolveAppointmentServiceOnlineCharge(
  svc: AppointmentChargeFields,
): AppointmentOnlineCharge {
  const req = resolveAppointmentPaymentRequirement(svc);
  if (req === 'none') return null;

  if (req === 'full_payment') {
    const price = svc.price_pence ?? 0;
    return price > 0 ? { amountPence: price, chargeLabel: 'full_payment' } : null;
  }

  const fee = svc.deposit_pence ?? 0;
  if (req === 'card_hold') {
    // Zero-fee safety (6.3): a hold with fee 0 would violate the hold table's
    // CHECK at booking time, so it degrades to no charge at all.
    return fee > 0 ? { amountPence: fee, chargeLabel: 'card_hold' } : null;
  }

  return fee > 0 ? { amountPence: fee, chargeLabel: 'deposit' } : null;
}

/**
 * The charge fields to stamp on a `MultiServiceSegment`.
 *
 * Add-on policy, matching the server's
 * `resolveAppointmentServiceOnlineChargeWithAddons`: add-on price rolls into a
 * `full_payment` charge, but a deposit stays at the service+variant amount
 * (add-ons are paid at the venue). Card-hold fees never include add-ons either.
 * Pass the base+variant service, and the add-on total separately.
 */
export function multiServiceSegmentCharge(
  svc: AppointmentChargeFields,
  addonsTotalPricePence: number,
): { chargePence: number | null; chargeLabel: 'deposit' | 'full_payment' | 'card_hold' | null } {
  const charge = resolveAppointmentServiceOnlineCharge(svc);
  if (!charge) return { chargePence: null, chargeLabel: null };
  if (charge.chargeLabel === 'full_payment') {
    return {
      chargePence: charge.amountPence + Math.max(0, addonsTotalPricePence),
      chargeLabel: 'full_payment',
    };
  }
  return { chargePence: charge.amountPence, chargeLabel: charge.chargeLabel };
}

/**
 * The chargeable (money-now) total across a multi-service visit, and the label
 * to describe it with.
 *
 * Card-hold fees are deliberately excluded: no money is due at booking for
 * them, and they carry their own separate staff toggle. The label follows the
 * web's `singleDetailsChargeLabel` rule, so a chain reads as 'full_payment'
 * only when every chargeable segment is pay-in-full.
 */
export function resolveVisitChargeTotal(segments: SegmentCharge[]): {
  amountPence: number;
  chargeLabel: 'deposit' | 'full_payment';
} {
  const chargeable = segments.filter((s) => s.chargeLabel !== 'card_hold');
  const amountPence = chargeable.reduce((sum, s) => sum + (s.chargePence ?? 0), 0);
  const allFullPayment =
    chargeable.length > 0 && chargeable.every((s) => s.chargeLabel === 'full_payment');
  return { amountPence, chargeLabel: allFullPayment ? 'full_payment' : 'deposit' };
}
