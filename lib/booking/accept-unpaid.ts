import { ApiError } from '@/lib/api/client';
import { formatPositivePence } from '@/lib/format';

/**
 * The unpaid-promotion guard (web deposit-payment-robustness-plan 6.1/6.2).
 *
 * `PATCH /api/venue/bookings/[id]` refuses to promote a `Pending` capture unit
 * that still owes its deposit or card save — on the status branch (→ `Booked`)
 * AND on the staff attendance toggle (→ `Confirmed`). It answers 409 with
 * `code: 'DEPOSIT_UNPAID'`, and the only way through is to repeat the same
 * PATCH with `accept_unpaid: true`.
 *
 * That is deliberate: accepting an unpaid booking is now an explicit, audited
 * decision (the server writes a `booking_accepted_without_payment` event and
 * sends the guest their confirmation), and the deposit stays collectable
 * afterwards — the payment link keeps working for an accepted booking. Waiving
 * is the OTHER choice, and it forgives the money.
 */

/** The 409 body, in app-side casing. */
export interface DepositUnpaidInfo {
  /** 'Pending' | 'Failed' — what the owing rows' deposit state is. */
  depositStatus: string | null;
  /** Money owed across the capture unit (pence). */
  depositAmountPence: number;
  /** Open unsaved card-hold fee across the unit (pence). */
  cardHoldFeePence: number;
}

/**
 * Narrow an error to the unpaid-promotion 409, or null when it is any other
 * failure. `apiFetch` keeps the parsed body on `ApiError.body`, so the amounts
 * needed for the copy come straight off the wire.
 */
export function depositUnpaid409(error: unknown): DepositUnpaidInfo | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const body = error.body;
  if (typeof body !== 'object' || body === null) return null;
  const row = body as {
    code?: unknown;
    deposit_status?: unknown;
    deposit_amount_pence?: unknown;
    card_hold_fee_pence?: unknown;
  };
  if (row.code !== 'DEPOSIT_UNPAID') return null;
  return {
    depositStatus: typeof row.deposit_status === 'string' ? row.deposit_status : null,
    depositAmountPence: typeof row.deposit_amount_pence === 'number' ? row.deposit_amount_pence : 0,
    cardHoldFeePence: typeof row.card_hold_fee_pence === 'number' ? row.card_hold_fee_pence : 0,
  };
}

export const ACCEPT_UNPAID_TITLE = 'Deposit not paid';

export const ACCEPT_UNPAID_EXPLAINER =
  'You can send the customer a new payment link, or accept the booking without payment and collect it later.';

/** What is actually owed, in the words the web dialog uses. */
export function acceptUnpaidBodyCopy(info: DepositUnpaidInfo): string {
  const deposit = formatPositivePence(info.depositAmountPence);
  const holdFee = formatPositivePence(info.cardHoldFeePence);
  const failed = info.depositStatus === 'Failed';

  if (deposit) {
    return failed
      ? `The ${deposit} deposit for this booking has not been paid. The last payment attempt failed.`
      : `The ${deposit} deposit for this booking has not been paid yet.`;
  }
  if (holdFee) {
    return `Card details have not been saved for this booking yet. The no-show fee is ${holdFee}.`;
  }
  return failed
    ? 'The payment for this booking failed and it is still owed.'
    : 'The payment for this booking has not been completed yet.';
}
