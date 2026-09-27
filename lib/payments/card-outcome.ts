import type { PaymentIntent } from '@stripe/stripe-terminal-react-native';
import { format } from 'date-fns';

import { formatPence } from '@/lib/format';

/**
 * How a card payment that did not succeed ended, in the words staff (and the
 * client's receipt) need: Apple's checklist 5.9 asks for approved, declined or
 * timed out to be told apart, and 5.10 for a receipt either way.
 */
export type CardOutcome = 'declined' | 'timed_out' | 'not_completed';

const DECLINED_CODES = new Set(['DECLINED_BY_STRIPE_API', 'DECLINED_BY_READER']);
const TIMED_OUT_CODES = new Set(['CARD_READ_TIMED_OUT', 'REQUEST_TIMED_OUT']);

export function cardOutcomeOf(
  error: { code?: string | null; apiError?: { declineCode?: string | null } | null } | null | undefined,
): CardOutcome {
  if (!error) return 'not_completed';
  const declineCode = error.apiError?.declineCode;
  if ((typeof declineCode === 'string' && declineCode.trim()) || DECLINED_CODES.has(String(error.code))) {
    return 'declined';
  }
  if (TIMED_OUT_CODES.has(String(error.code))) return 'timed_out';
  return 'not_completed';
}

/** Brand and last four digits of the card, when the SDK reported them. */
export type CardSummary = { brand: string | null; last4: string | null };

export function cardSummaryOf(paymentIntent: PaymentIntent.Type | null | undefined): CardSummary | null {
  const details =
    paymentIntent?.paymentMethod?.cardPresentDetails ??
    paymentIntent?.charges?.[0]?.paymentMethodDetails?.cardPresentDetails ??
    null;
  if (!details) return null;
  const brand = details.brand?.trim() || null;
  const last4 = details.last4?.trim() || null;
  return brand || last4 ? { brand, last4 } : null;
}

/** What a failed card payment carries back to the sheet, for its outcome and receipt. */
export type CardPaymentFailure = {
  outcome: CardOutcome;
  amountPence: number | null;
  paymentIntentId: string | null;
  card: CardSummary | null;
};

/**
 * An `Error` (so every existing `e instanceof Error ? e.message` path still reads
 * it) that also says how the payment ended.
 */
export function cardPaymentError(message: string, failure: CardPaymentFailure): Error & CardPaymentFailure {
  return Object.assign(new Error(message), failure);
}

export function isCardPaymentFailure(e: unknown): e is Error & CardPaymentFailure {
  return e instanceof Error && typeof (e as Partial<CardPaymentFailure>).outcome === 'string';
}

/** A card payment's receipt (checklist 5.10): approved or not. */
export type CardReceipt = {
  venueName: string | null;
  amountPence: number | null;
  /** Null = approved. */
  outcome: CardOutcome | null;
  at: Date;
  paymentIntentId: string | null;
  card: CardSummary | null;
};

const OUTCOME_LABEL: Record<CardOutcome, string> = {
  declined: 'Declined',
  timed_out: 'Not completed (timed out)',
  not_completed: 'Not completed',
};

/**
 * Plain-text receipt for the share sheet. Apple asks for a CONFIDENTIAL receipt,
 * so it carries no client name or contact details, and only the card's last four
 * digits.
 */
export function cardReceiptText(r: CardReceipt): string {
  const lines = [
    r.venueName ? `Receipt from ${r.venueName}` : 'Card payment receipt',
    `Card payment: ${r.outcome ? OUTCOME_LABEL[r.outcome] : 'Approved'}`,
  ];
  const amount = formatPence(r.amountPence);
  if (amount) lines.push(`Amount: ${amount}`);
  if (r.card) {
    const card = [r.card.brand, r.card.last4 ? `•••• ${r.card.last4}` : null].filter(Boolean).join(' ');
    if (card) lines.push(`Card: ${card}`);
  }
  lines.push(`Date: ${format(r.at, 'd MMM yyyy, HH:mm')}`);
  if (r.paymentIntentId) lines.push(`Reference: ${r.paymentIntentId}`);
  return lines.join('\n');
}

/** Message for the share sheet's title and the "not approved" notification. */
export function cardOutcomeHeading(outcome: CardOutcome): string {
  switch (outcome) {
    case 'declined':
      return 'Payment declined';
    case 'timed_out':
      return 'Payment timed out';
    case 'not_completed':
      return 'Payment not completed';
  }
}
