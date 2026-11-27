/**
 * Staff bookings that ask the client for a deposit now work as card requests do (web
 * Docs/deposit-handling-review-plan.md DH1, DH2, DH5; owner, 26 Nov 2026). Mirrors web
 * `src/lib/booking/staff-deposit-deadline.ts`, so the form can show the deadline before saving:
 *
 * - staff choose, per booking, whether an unpaid deposit cancels it ("Cancel if not paid by ...",
 *   on by default; the create sends `cancel_if_unpaid`). On, the booking waits as Pending until
 *   the deadline; off, it is Booked now with the deposit still owed;
 * - the deadline is the earlier of 24 hours from now or 2 hours before the start, the card rule.
 *   A booking that close to its start is never set to cancel;
 * - a client with no email and no mobile cannot be sent the link, so the booking is never set to
 *   cancel: it is Booked with the deposit owed and staff share the link themselves.
 *
 * The server decides with the same rule; the create's answer does not say which it chose, so the
 * confirmation screen works it out here as the web's does.
 */

import { getDateTimeFormat } from '@/lib/dates/formatters';
import { venueWallTimeToUtcMs } from '@/lib/pos/voucher-math';

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/** The earlier of 24 hours from `nowMs` or 2 hours before the start; null when already passed. */
export function depositCancelDeadline(nowMs: number, startMs: number | null): string | null {
  const candidates = [nowMs + DAY_MS];
  if (startMs != null && Number.isFinite(startMs)) candidates.push(startMs - TWO_HOURS_MS);
  const deadline = Math.min(...candidates);
  return deadline > nowMs ? new Date(deadline).toISOString() : null;
}

/** Whether the client can be sent the payment link at all (an email or a mobile on record). */
export function depositClientReachable(email: string | null | undefined, phone: string | null | undefined): boolean {
  return Boolean((email ?? '').trim() || (phone ?? '').trim());
}

/**
 * A deposit deadline as staff read it, in the business's time zone: "Wed 2 Dec, 13:00" (`short`)
 * or "Wednesday 2 December at 13:00" (`long`).
 */
export function formatDepositDeadline(
  iso: string,
  timeZone: string | null | undefined,
  style: 'long' | 'short' = 'short',
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const tz = timeZone?.trim() || 'Europe/London';
  const part = (opts: Intl.DateTimeFormatOptions) => getDateTimeFormat('en-GB', { timeZone: tz, ...opts }).format(d);
  const time = part({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  if (style === 'short') return `${part({ weekday: 'short' })} ${part({ day: 'numeric' })} ${part({ month: 'short' })}, ${time}`;
  return `${part({ weekday: 'long' })} ${part({ day: 'numeric' })} ${part({ month: 'long' })} at ${time}`;
}

/** The appointment's start as a UTC instant, from its venue-local date and "HH:MM"; null when unknown. */
export function appointmentStartMs(
  date: string | null | undefined,
  time: string | null | undefined,
  timeZone: string | null | undefined,
): number | null {
  if (!date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(time)) return null;
  const ms = venueWallTimeToUtcMs(date, time.slice(0, 5), timeZone?.trim() || 'Europe/London');
  return Number.isFinite(ms) ? ms : null;
}

/** "Cancel if not paid by ..." for the form: the short deadline, or null under 2 hours to go. */
export function staffDepositDeadlineText(params: {
  date: string | null | undefined;
  time: string | null | undefined;
  timeZone: string | null | undefined;
  nowMs?: number;
}): string | null {
  const at = depositCancelDeadline(params.nowMs ?? Date.now(), appointmentStartMs(params.date, params.time, params.timeZone));
  return at ? formatDepositDeadline(at, params.timeZone, 'short') : null;
}

/** What a staff booking that asks for a deposit does if it is not paid. */
export interface StaffDepositOutcome {
  /** Booked now with the deposit still due (never cancelled for it). */
  kept: boolean;
  /** When a waiting booking is cancelled if still unpaid ("Wed 2 Dec, 13:00"); null when kept. */
  cancelOn: string | null;
  /** "deposit", or "payment" for a service paid in full. */
  word: 'deposit' | 'payment';
}

/**
 * The outcome the server chooses (web `staffDepositHold`): kept when staff turned "Cancel if not
 * paid" off, the client cannot be reached, or the appointment is under 2 hours away; otherwise it
 * waits until the deadline.
 */
export function staffDepositOutcome(params: {
  cancelIfUnpaid: boolean;
  reachable: boolean;
  deadlineText: string | null;
  word: 'deposit' | 'payment';
}): StaffDepositOutcome {
  const kept = !params.cancelIfUnpaid || !params.reachable || !params.deadlineText;
  return { kept, cancelOn: kept ? null : params.deadlineText, word: params.word };
}

/** "Cancel if not paid by Wed 2 Dec, 13:00". */
export function staffCancelIfUnpaidLabel(deadlineText: string): string {
  return `Cancel if not paid by ${deadlineText}`;
}

/** The help under the choice, for each position. */
export function staffCancelIfUnpaidHelp(on: boolean, word: 'deposit' | 'payment'): string {
  return on
    ? 'The booking waits until the client pays, and is cancelled if they do not.'
    : `The booking is confirmed now and the ${word} stays due.`;
}

/** Under 2 hours to go: no choice, the booking is kept. */
export function staffDepositTooCloseLine(word: 'deposit' | 'payment'): string {
  return `The appointment is less than 2 hours away, so the booking is confirmed now and the ${word} stays due.`;
}

/** No email or mobile: no choice, the booking is kept. */
export function staffDepositNoContactLine(word: 'deposit' | 'payment'): string {
  // Shown before any details are typed too, so it asks rather than tells (web, 26 Nov 2026).
  return `Cancel if not paid needs the client's email or mobile to send the link. Without them, the booking is confirmed now with the ${word} still due, and you can share the payment link from the booking.`;
}

/** The confirmation screen for a booking staff kept without the money. */
export function staffDepositKeptLine(word: 'deposit' | 'payment'): string {
  return `The booking is confirmed, with the ${word} still due. It stays booked if the ${word} is not paid.`;
}

/** The confirmation screen's deadline sentence for a booking waiting for the money. */
export function staffDepositCancelOnLine(cancelOn: string): string {
  return `If it is not paid by ${cancelOn}, the booking is cancelled.`;
}

/**
 * The outcome the server reported (`deposit_kept`, `deposit_cancel_at` on the staff create answer),
 * which wins over the app's own reckoning; null from an older server that does not say.
 */
export function staffDepositOutcomeFromServer(
  response: { deposit_kept?: boolean; deposit_cancel_at?: string | null },
  timeZone: string | null | undefined,
  word: 'deposit' | 'payment',
): StaffDepositOutcome | null {
  if (typeof response.deposit_kept !== 'boolean') return null;
  const cancelOn =
    !response.deposit_kept && response.deposit_cancel_at
      ? formatDepositDeadline(response.deposit_cancel_at, timeZone ?? 'Europe/London', 'short')
      : null;
  return { kept: response.deposit_kept || !cancelOn, cancelOn, word };
}
