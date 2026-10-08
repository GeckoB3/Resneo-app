import { newPaymentAttemptId } from '@/lib/payments/attempt-id';

/**
 * The idempotency key for a cash or "other" payment (POS plan P0-5, R7).
 *
 * The charge route used to insert a ledger row for every cash request, so a double tap, or a retry
 * after a slow venue network timed out, recorded the money twice. A server with POS Pass 0 now
 * takes a `client_request_id`: the same key records once and echoes the first payment.
 *
 * ONE key per payment staff are recording, not per request: the sheet keeps it while the booking,
 * method and amount stay the same, so a retry of the same payment reuses it, and mints a new one
 * once that payment succeeds or the details change. Changed details with the old key would be a
 * different payment, which the server refuses (409), so they always get a fresh key.
 */
export interface ExternalPaymentKey {
  key: string;
  signature: string;
}

export function externalPaymentSignature(input: {
  bookingId: string;
  method: 'cash' | 'external';
  amountPence: number | null | undefined;
}): string {
  return `${input.bookingId}|${input.method}|${input.amountPence ?? 'balance'}`;
}

/** The key to send: the held one when it is for the same payment, else a fresh one. */
export function keyForExternalPayment(
  held: ExternalPaymentKey | null,
  signature: string,
  mint: () => string = newPaymentAttemptId,
): ExternalPaymentKey {
  if (held && held.signature === signature) return held;
  return { key: mint(), signature };
}
