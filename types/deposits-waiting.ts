/**
 * GET /api/venue/deposits-waiting: upcoming staff bookings still owing their deposit, soonest
 * deadline first, a visit once (web Docs/deposit-handling-review-plan.md DH3, 26 Nov 2026). Mirrors
 * web `DepositWaitingItem` in `src/lib/booking/deposits-waiting.ts`.
 *
 * The server words every row, so the app shows `client_name`, `text`, `status_label` and
 * `link_label` as they come. Any team member may read it (a Hidden person sees their own calendars).
 */

export interface DepositWaitingItem {
  booking_id: string;
  client_name: string;
  /** "Root Tint, Tue 1 Dec 15:00". */
  text: string;
  amount_pence: number;
  word: 'deposit' | 'payment';
  /** Waiting (Pending, cancelled at `cancel_at` if unpaid) or kept (Booked with it still due). */
  state: 'waiting' | 'kept';
  cancel_at: string | null;
  /** "Cancelled Wed 2 Dec, 13:00 if not paid", "Stays booked if not paid". */
  status_label: string;
  /** "Link sent Tue 1 Dec, 09:12", or "No link sent yet". */
  link_label: string;
  /** The client has an email or mobile, so a link can be sent. */
  can_send: boolean;
}

export interface DepositsWaitingResponse {
  items: DepositWaitingItem[];
  count: number;
  currency: string;
}

/** "1 upcoming booking is waiting for payment" / "3 upcoming bookings are waiting for payment". */
export function depositsWaitingHeadline(n: number): string {
  return n === 1 ? '1 upcoming booking is waiting for payment' : `${n} upcoming bookings are waiting for payment`;
}
