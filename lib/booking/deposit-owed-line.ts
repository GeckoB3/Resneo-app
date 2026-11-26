/**
 * What a booking that still owes its deposit is waiting for, until when, and what happens then
 * (web deposit-handling plan DH2, DH4, 26 Nov 2026). Mirrors web `owedDepositStatusLine` in
 * `src/app/dashboard/bookings/expanded-booking-money-lines.ts` and `canKeepWithoutDeposit` in
 * `src/components/booking/KeepWithoutDepositButton.tsx`. Pure, so each wording is unit-tested.
 */

import { getDateTimeFormat } from '@/lib/dates/formatters';
import { formatPence } from '@/lib/format';

const DEPOSIT_REQUEST_TYPES = new Set(['deposit_request', 'deposit_payment_request', 'deposit_payment_reminder']);

/** Bookings made before deadlines were stored are cancelled this long after they were made. */
export const PHONE_DEPOSIT_TIMEOUT_HOURS = 24;

function ymdIn(date: Date, timeZone: string): string {
  return getDateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** "today at 12:27", "tomorrow at 12:27", "yesterday at 12:27" or "on Mon 9 Nov at 12:27", in the venue's time. */
export function relativeVenueTime(iso: string, timeZone: string, now: Date = new Date()): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const time = getDateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  const day = ymdIn(at, timeZone);
  const today = ymdIn(now, timeZone);
  const dayMs = 24 * 60 * 60 * 1000;
  if (day === today) return `today at ${time}`;
  if (day === ymdIn(new Date(now.getTime() + dayMs), timeZone)) return `tomorrow at ${time}`;
  if (day === ymdIn(new Date(now.getTime() - dayMs), timeZone)) return `yesterday at ${time}`;
  const date = getDateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(at);
  return `on ${date.replace(',', '')} at ${time}`;
}

/**
 * One line beside an owed deposit's actions: how much is owed, whether a payment link has gone out
 * and when, and what happens if it is not paid. A waiting (Pending) booking says when it is
 * cancelled; one staff kept (Booked or Confirmed) says it stays booked.
 */
export function owedDepositStatusLine(input: {
  status: string;
  depositStatus: string | null | undefined;
  depositAmountPence: number | null | undefined;
  isFullPayment: boolean;
  source: string | null | undefined;
  createdAt: string | null | undefined;
  linkedVisitId: string | null | undefined;
  /** The booking's sent messages; null or absent while not loaded (nothing is said about the link). */
  communications: readonly { message_type: string; status: string; created_at: string }[] | null | undefined;
  /** This part of a visit across businesses is covered by the visit's one open payment link. */
  coveredByVisitLink?: boolean;
  /** `bookings.deposit_cancel_at`; absent on bookings made before it (the old 24-hour rule then). */
  depositCancelAt?: string | null;
  currency?: string | null;
  timeZone: string;
  now?: Date;
}): string | null {
  const owed = input.depositStatus === 'Pending' || input.depositStatus === 'Failed';
  const amount = input.depositAmountPence ?? 0;
  if (!owed || amount <= 0) return null;
  if (input.status === 'Cancelled' || input.status === 'No-Show') return null;
  const now = input.now ?? new Date();
  const what = input.isFullPayment ? 'Payment' : 'Deposit';
  const money = formatPence(amount, input.currency ?? undefined) ?? '';
  const parts: string[] = [
    input.depositStatus === 'Failed'
      ? `${what} ${money} owed: the last payment attempt failed.`
      : `${what} ${money} owed.`,
  ];
  if (input.coveredByVisitLink) {
    parts.push("The visit's payment link covers it.");
    return parts.join(' ');
  }
  if (input.communications) {
    const sent = input.communications
      .filter(
        (c) =>
          DEPOSIT_REQUEST_TYPES.has(c.message_type.replace(/_(email|sms)$/i, '')) &&
          c.status !== 'failed' &&
          c.status !== 'bounced',
      )
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const when = sent ? relativeVenueTime(sent.created_at, input.timeZone, now) : null;
    parts.push(when ? `Payment link sent ${when}.` : 'No payment link has been sent yet.');
  }
  // Kept by staff (Booked with the deposit owed): it stays booked whether or not it is paid.
  if (input.status === 'Booked' || input.status === 'Confirmed') {
    parts.push('The booking stays booked if it is not paid.');
    return parts.join(' ');
  }
  // Mirrors the auto-cancel job: a waiting booking is cancelled at its deadline.
  if (input.status === 'Pending' && !input.linkedVisitId && input.depositCancelAt) {
    const deadline = new Date(input.depositCancelAt);
    const when = Number.isNaN(deadline.getTime()) ? null : relativeVenueTime(deadline.toISOString(), input.timeZone, now);
    if (when) {
      parts.push(
        deadline.getTime() > now.getTime()
          ? `If it is not paid by ${when}, the booking is cancelled.`
          : 'Its time to pay has passed, so the booking will be cancelled soon if it stays unpaid.',
      );
    }
    return parts.join(' ');
  }
  // A booking made before deadlines were stored: Pending, made by phone, cancelled a day after.
  if (input.status === 'Pending' && input.source === 'phone' && !input.linkedVisitId && input.createdAt) {
    const made = new Date(input.createdAt);
    if (!Number.isNaN(made.getTime())) {
      const deadline = new Date(made.getTime() + PHONE_DEPOSIT_TIMEOUT_HOURS * 60 * 60 * 1000);
      const when = relativeVenueTime(deadline.toISOString(), input.timeZone, now);
      if (when) {
        parts.push(
          deadline.getTime() > now.getTime()
            ? `If it is not paid by ${when}, the booking is cancelled.`
            : 'It was due to be paid within a day of booking, so the booking will be cancelled soon if it stays unpaid.',
        );
      }
    }
  }
  return parts.join(' ');
}

/**
 * Whether "Keep without deposit" applies: a booking waiting (Pending) for a deposit it still owes,
 * not part of a visit across businesses (that visit has its own pay link and rules).
 */
export function canKeepWithoutDeposit(b: {
  status: string | null | undefined;
  deposit_status: string | null | undefined;
  deposit_amount_pence: number | null | undefined;
  linked_visit_id?: string | null;
}): boolean {
  return (
    b.status === 'Pending' &&
    (b.deposit_status === 'Pending' || b.deposit_status === 'Failed') &&
    (b.deposit_amount_pence ?? 0) > 0 &&
    !b.linked_visit_id
  );
}

/** "Keep without deposit", or "Keep without payment" for a full payment. */
export function keepWithoutDepositLabel(word: 'deposit' | 'payment'): string {
  return word === 'payment' ? 'Keep without payment' : 'Keep without deposit';
}

/** The question asked before keeping it: the client's confirmation goes out at once. */
export function keepWithoutDepositQuestion(input: {
  word: 'deposit' | 'payment';
  amountPence: number | null | undefined;
  currency?: string | null;
  guestName: string | null | undefined;
}): { title: string; message: string; confirmLabel: string } {
  const who = input.guestName?.trim() || 'The client';
  const amount =
    input.amountPence && input.amountPence > 0 ? formatPence(input.amountPence, input.currency ?? undefined) : null;
  return {
    title: `Keep without the ${input.word}?`,
    message: `The booking stays booked even if the ${input.word} is not paid. ${who} is sent a confirmation that says ${
      amount ? `the ${amount} ${input.word}` : `the ${input.word}`
    } is still due, with the payment link.`,
    confirmLabel: 'Keep booking',
  };
}
