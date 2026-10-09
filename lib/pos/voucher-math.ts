import type { PosPayment, PosSale, PosSaleLine, PosVoucherSettings } from '@/types/pos';

/**
 * The gift voucher and account credit rules in the app (UX spec §20.2 to §20.5), pure so each is
 * tested on its own, and kept in step with the web till's `vouchers/voucher-math.ts` and
 * `vouchers/voucher-dto.ts`. Every amount is integer pence. The server checks all of these again;
 * these only stop a request that would be refused, and say why in the deck's words.
 */

// ─── Dates in the venue's zone ──────────────────────────────────────────────

/** Today as YYYY-MM-DD in the venue's zone. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return ymdInZone(now.getTime(), timeZone);
}

function ymdInZone(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(
    new Date(ms),
  );
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** How far the zone's wall clock is ahead of UTC at an instant, in ms. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const hour = get('hour') % 24;
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return wall - Math.floor(utcMs / 1000) * 1000;
}

/** The UTC instant of a wall-clock time on a day in the venue's zone. */
export function venueWallTimeToUtcMs(ymd: string, hhmm: string, timeZone: string): number {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const [hh, mm] = hhmm.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - zoneOffsetMs(guess, timeZone);
  const second = guess - zoneOffsetMs(first, timeZone);
  return second;
}

/** "3 October 2026" in the venue's zone; a bare YYYY-MM-DD is read as that day. */
export function formatDay(isoOrYmd: string | null | undefined, timeZone: string): string {
  if (!isoOrYmd) return '';
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(isoOrYmd);
  const d = new Date(ymd ? `${isoOrYmd}T12:00:00Z` : isoOrYmd);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: ymd ? 'UTC' : timeZone,
  }).format(d);
}

/**
 * The last day a voucher can be used, as people read it ("31 December 2026"). A voucher stops at
 * the start of the next venue-local day, so the last good day is a second before.
 */
export function voucherLastDay(expiresAt: string | null | undefined, timeZone: string): string | null {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return null;
  return formatDay(new Date(at - 1000).toISOString(), timeZone);
}

// ─── Selling (§20.2) ────────────────────────────────────────────────────────

export type VoucherLimits = Pick<PosVoucherSettings, 'preset_pence' | 'custom_allowed' | 'min_pence' | 'max_pence'>;

export type VoucherAmountProblem = 'empty' | 'notOffered' | 'tooLow' | 'tooHigh';

/**
 * Why a value cannot be sold, or null. Matches the server's order: a venue that allows only its
 * presets refuses anything else, then the minimum and the maximum.
 */
export function voucherAmountProblem(limits: VoucherLimits, pence: number | null): VoucherAmountProblem | null {
  if (pence == null || !Number.isFinite(pence) || pence <= 0) return 'empty';
  if (!limits.custom_allowed && !limits.preset_pence.includes(pence)) return 'notOffered';
  if (pence < limits.min_pence) return 'tooLow';
  if (pence > limits.max_pence) return 'tooHigh';
  return null;
}

/** The days a voucher email can be sent on: tomorrow to a year ahead, in the venue's zone. */
export function sendDateBounds(todayYmd: string): { min: string; max: string } {
  return { min: addDaysToYmd(todayYmd, 1), max: addDaysToYmd(todayYmd, 365) };
}

export function sendDateProblem(ymd: string, todayYmd: string): 'empty' | 'outOfRange' | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return 'empty';
  const { min, max } = sendDateBounds(todayYmd);
  return ymd < min || ymd > max ? 'outOfRange' : null;
}

/** The instant to send on a chosen day: 8am there (`vsell.sendDate.help`). */
export function sendAtIso(ymd: string, timeZone: string): string {
  return new Date(venueWallTimeToUtcMs(ymd, '08:00', timeZone)).toISOString();
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export type VoucherWho = 'buyer' | 'gift';
export type VoucherDeliveryChoice = 'print' | 'emailNow' | 'emailLater';

export interface VoucherSellDraft {
  valuePence: number | null;
  who: VoucherWho;
  recipientName: string;
  recipientEmail: string;
  message: string;
  delivery: VoucherDeliveryChoice;
  sendDate: string;
  buyerEmail: string;
}

/**
 * Whether the sell form can be sent, and the `gift_card` line it sends (#7). Emailing needs an
 * address: theirs for a gift, otherwise the client's, or one typed for a walk-in. The body never
 * carries a code: the server makes one when the sale completes.
 */
export function voucherSellLine(
  draft: VoucherSellDraft,
  ctx: { limits: VoucherLimits; todayYmd: string; timeZone: string; clientName: string | null; clientEmail: string | null },
): { ready: boolean; needsBuyerEmail: boolean; amountProblem: VoucherAmountProblem | null; line: Record<string, unknown> } {
  const amountProblem = voucherAmountProblem(ctx.limits, draft.valuePence);
  const emailing = draft.delivery !== 'print';
  const clientEmail = ctx.clientEmail?.trim() || null;
  const toAddress = draft.who === 'gift' ? draft.recipientEmail.trim() : clientEmail ?? draft.buyerEmail.trim();
  const needsBuyerEmail = draft.who === 'buyer' && emailing && !clientEmail;
  const dateProblem = draft.delivery === 'emailLater' ? sendDateProblem(draft.sendDate, ctx.todayYmd) : null;
  const ready =
    amountProblem === null &&
    (draft.who === 'buyer' || Boolean(draft.recipientName.trim())) &&
    (!emailing || looksLikeEmail(toAddress)) &&
    dateProblem === null &&
    draft.message.length <= 300;

  const line: Record<string, unknown> = { kind: 'gift_card', value_pence: draft.valuePence };
  if (ctx.clientName) line.buyer_name = ctx.clientName;
  if (draft.who === 'gift') {
    line.recipient_name = draft.recipientName.trim();
    if (draft.message.trim()) line.message = draft.message.trim();
    if (emailing) {
      line.recipient_email = draft.recipientEmail.trim();
      if (clientEmail) line.buyer_email = clientEmail;
    }
  } else if (emailing) {
    line.buyer_email = toAddress;
  }
  if (draft.delivery === 'emailLater') line.send_at = sendAtIso(draft.sendDate, ctx.timeZone);
  return { ready, needsBuyerEmail, amountProblem, line };
}

// ─── The voucher on a line ──────────────────────────────────────────────────

export type VoucherDelivery = 'print' | 'now' | 'later';

export function isVoucherLine(line: Pick<PosSaleLine, 'line_type'>): boolean {
  return line.line_type === 'gift_card';
}

/** How a voucher line reaches its holder: a date means later, an address means when paid. */
export function voucherDelivery(v: { send_at?: string | null; recipient_email?: string | null; buyer_email?: string | null } | null | undefined): VoucherDelivery {
  if (v?.send_at) return 'later';
  if (v?.recipient_email || v?.buyer_email) return 'now';
  return 'print';
}

/** The vouchers a completed sale made: lines whose voucher exists. */
export function issuedVouchers(sale: Pick<PosSale, 'lines'>): PosSaleLine[] {
  return sale.lines.filter((l) => isVoucherLine(l) && Boolean(l.voucher?.account_id));
}

// ─── Paying with a voucher or credit (§20.2 to §20.4) ───────────────────────

export function isStoredValueMethod(method: string): method is 'gift_card' | 'account_credit' {
  return method === 'gift_card' || method === 'account_credit';
}

/** What the sale's gift voucher lines still come to: these can only be paid with money. */
export function voucherLinesPence(sale: Pick<PosSale, 'lines'>): number {
  return sale.lines
    .filter((l) => isVoucherLine(l))
    .reduce((sum, l) => sum + Math.max(0, l.total_pence - l.refunded_pence), 0);
}

/**
 * How much of the balance a voucher or credit may pay: the balance less the sale's voucher lines
 * (plan §4.33.3, `vpay.notForVouchers`). `heldPence` is the part that must be paid another way.
 */
export function storedValueCap(sale: Pick<PosSale, 'lines' | 'balance_due_pence'>): { capPence: number; heldPence: number } {
  const balance = Math.max(0, sale.balance_due_pence);
  const cap = Math.max(0, balance - voucherLinesPence(sale));
  return { capPence: cap, heldPence: balance - cap };
}

/** The amount field's first value: the smaller of what is on it and what can be paid this way. */
export function storedValueDefault(availablePence: number, capPence: number): number {
  return Math.max(0, Math.min(availablePence, capPence));
}

export type StoredValueAmountProblem = 'empty' | 'zero' | 'overAvailable' | 'overCap';

export function storedValueAmountProblem(
  amountPence: number | null,
  availablePence: number,
  capPence: number,
): StoredValueAmountProblem | null {
  if (amountPence == null) return 'empty';
  if (amountPence <= 0) return 'zero';
  if (amountPence > availablePence) return 'overAvailable';
  if (amountPence > capPence) return 'overCap';
  return null;
}

/** A voucher found by its code that cannot be used, and why (§20.3 states). */
export type VoucherBlock = 'usedUp' | 'cancelled' | 'frozen' | 'expired';

export function voucherBlock(status: string): VoucherBlock | null {
  switch (status) {
    case 'used_up':
      return 'usedUp';
    case 'cancelled':
      return 'cancelled';
    case 'frozen':
      return 'frozen';
    case 'expired':
      return 'expired';
    default:
      return null;
  }
}

/**
 * The sentence for a voucher on hold, as the web till words it: "payment dispute" only when the
 * look-up's `on_hold` says a dispute froze it; otherwise (an admin's hold, or an older server that
 * does not say) the server's own sentence, which names no reason.
 */
export function voucherFrozenCopyId(onHold: string | null | undefined): 'err.VOUCHER_FROZEN' | 'err.VOUCHER_FROZEN.dispute' {
  return onHold === 'dispute' ? 'err.VOUCHER_FROZEN.dispute' : 'err.VOUCHER_FROZEN';
}

/** The status pill's copy id for a voucher status. */
export function voucherStatusCopyId(
  status: string | null | undefined,
): 'vch.status.active' | 'vch.status.usedUp' | 'vch.status.expired' | 'vch.status.frozen' | 'vch.status.cancelled' {
  switch (status) {
    case 'used_up':
      return 'vch.status.usedUp';
    case 'expired':
      return 'vch.status.expired';
    case 'frozen':
      return 'vch.status.frozen';
    case 'cancelled':
      return 'vch.status.cancelled';
    default:
      return 'vch.status.active';
  }
}

/** What a gift voucher or credit payment still holds (not refunded). */
function liveStoredValue(p: Pick<PosPayment, 'status' | 'amount_pence' | 'refunded_pence'>): number {
  return p.status === 'succeeded' ? Math.max(0, p.amount_pence - p.refunded_pence) : 0;
}

/** Credit used and not refunded locks the client on the sale (`cpay.clientLocked`). */
export function creditLocked(sale: Pick<PosSale, 'payments'>): boolean {
  return sale.payments.some((p) => p.method === 'account_credit' && liveStoredValue(p) > 0);
}

/** The applied voucher or credit on a sale, for the totals rows `totals.voucher` and `totals.credit`. */
export function appliedStoredValue(payments: PosPayment[], method: 'gift_card' | 'account_credit'): number {
  return payments.filter((p) => p.method === method).reduce((s, p) => s + liveStoredValue(p), 0);
}

// ─── Refunds (§20.5) ────────────────────────────────────────────────────────

/**
 * What a payment can still give back. Money payments say so in the sale; a voucher or credit
 * payment is applied, not money, so the sale leaves its refundable at zero and it is worked out
 * here, as the refund function does (amount less what was refunded).
 */
export function refundableOf(p: PosPayment): number {
  if (p.is_money) return p.refundable_pence;
  if (isStoredValueMethod(p.method)) return liveStoredValue(p);
  return 0;
}

/** True when the voucher a payment drew on can no longer take money back (expired or cancelled). */
export function paymentVoucherGone(p: Pick<PosPayment, 'method' | 'voucher'>, nowMs: number = Date.now()): boolean {
  if (p.method !== 'gift_card') return false;
  const v = p.voucher;
  if (!v) return false;
  if (v.status === 'expired' || v.status === 'cancelled') return true;
  return Boolean(v.expires_at && Date.parse(v.expires_at) <= nowMs);
}

/**
 * Where a voucher or credit payment's part of a refund goes (§20.5): back where it came from. A
 * voucher that has run out sends it to the client's account credit instead, which needs a client.
 * Null for a money payment.
 */
export function storedValueRefundNote(
  p: Pick<PosPayment, 'method' | 'voucher'>,
  hasClient: boolean,
  nowMs: number = Date.now(),
): { note: 'voucherExpired' | 'needsClient' | null; blocked: boolean } | null {
  if (!isStoredValueMethod(p.method)) return null;
  if (p.method === 'gift_card' && paymentVoucherGone(p, nowMs)) {
    return { note: hasClient ? 'voucherExpired' : 'needsClient', blocked: !hasClient };
  }
  return { note: null, blocked: false };
}

/**
 * Refunding a gift voucher line (§20.5): what is left on it, and only an admin once part is used.
 * `unknown` when the sale does not say what is left on the voucher.
 */
export function voucherLineRefundState(
  voucher: Pick<NonNullable<PosSaleLine['voucher']>, 'balance_pence'> | null | undefined,
  initialPence: number,
  isAdmin: boolean,
): { state: 'ok' | 'usedUp' | 'adminOnly' | 'unknown'; balancePence: number | null } {
  const balance = voucher?.balance_pence ?? null;
  if (balance == null) return { state: 'unknown', balancePence: null };
  if (balance <= 0) return { state: 'usedUp', balancePence: 0 };
  if (balance < initialPence && !isAdmin) return { state: 'adminOnly', balancePence: balance };
  return { state: 'ok', balancePence: balance };
}
