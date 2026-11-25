/**
 * GET /api/venue/fees-to-charge: no-show and client late-cancellation fees this business can still
 * charge, soonest deadline first (web Docs/fees-to-charge-plan.md §2.1, §2.2). Mirrors web
 * `src/lib/cards-on-file/fees-to-charge-types.ts`.
 *
 * The server words every row, so the app shows `client_name`, `text` and `charge_by_label` as they
 * come. Admins only: anyone else gets 403, and the Today card stays hidden.
 */

export type FeeToChargeReason = 'no_show' | 'late_cancellation';

export interface FeeToCharge {
  /** The charge dialog's id: the visit's group id, or the booking's own id. */
  visit_id: string;
  /** This business's services in it that the fee covers. */
  booking_ids: string[];
  client_name: string;
  /** "No-show: Full Head Highlights with Jenny Ross, Mon 23 Nov, 2:30pm" or "Cancelled late: ...". */
  text: string;
  reason: FeeToChargeReason;
  /** The fees of the services, summed, in minor units. */
  amount_pence: number;
  currency: string;
  /** When the fee can no longer be charged (ISO): the card hold is released then. */
  charge_by: string;
  /** "Charge by Mon 7 Dec". */
  charge_by_label: string;
  /** The deadline is within two days. */
  urgent: boolean;
  /** False: the card can no longer be charged (FC2); send a payment link instead. */
  chargeable: boolean;
}

export interface FeesToChargeResponse {
  items: FeeToCharge[];
  count: number;
  /** Every listed fee, summed. */
  total_pence: number;
  currency: string;
}

/** Card copy, shared by the web and the app (web `feesToChargeHeadline`). */
export function feesToChargeHeadline(count: number): string {
  return count === 1 ? '1 fee to charge' : `${count} fees to charge`;
}

/** The label on a row whose card can no longer be charged (web `FEE_CARD_CANNOT_BE_CHARGED`). */
export const FEE_CARD_CANNOT_BE_CHARGED = "Card can't be charged";
