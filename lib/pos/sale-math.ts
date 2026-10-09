import type { PosCopyId } from '@/lib/pos/copy';
import type { PosPayment, PosSale, PosSaleLine, PosTipSettings } from '@/types/pos';

/**
 * Checkout's arithmetic in the app: the payment panel, tips, the refund builder, the discount
 * preview and the totals block (UX spec §3.7, §3.12, §3.18, §3.19, §3.22). Pure, so each piece is
 * tested on its own, and kept in step with the web till's `payment-math.ts`, `refund-math.ts`,
 * `discount-math.ts` and `totals-display.ts` so a sale reads the same on both. Every amount is
 * integer pence. The server prices everything; these only preview and check before sending.
 */

export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

// ─── Money input ────────────────────────────────────────────────────────────

/** "12", "12.5", "£12.50", "1,250.00" to pence; null when it is not a money amount. */
export function parseMoneyInput(text: string): number | null {
  const cleaned = text.replace(/[£€$,\s]/g, '');
  if (!cleaned) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole = '0', frac = ''] = cleaned.split('.');
  const pence = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return Number.isSafeInteger(pence) ? pence : null;
}

/** Pence to the text a money field shows ("12.50"). */
export function penceToInput(pence: number): string {
  const abs = Math.max(0, Math.round(pence));
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// ─── Paying ─────────────────────────────────────────────────────────────────

/** The change to hand back: what was handed over less what is due, never below zero. */
export function cashChange(duePence: number, tenderedPence: number | null): number {
  if (tenderedPence == null) return 0;
  return Math.max(0, tenderedPence - duePence);
}

/** The quick buttons under "Cash handed over": the exact amount, then the next round £5, £10, £20 and £50. */
export function cashQuickAmounts(duePence: number): number[] {
  const out = [duePence];
  for (const step of [500, 1000, 2000, 5000]) {
    const next = Math.floor(duePence / step) * step + step;
    if (next > duePence && !out.includes(next)) out.push(next);
  }
  return out.sort((a, b) => a - b);
}

/** Cash is ready to record once what was handed over covers the amount and the tip. */
export function cashCovers(amountPence: number, tipPence: number, tenderedPence: number | null): boolean {
  if (tenderedPence == null) return true; // nothing typed: the exact amount was handed over
  return tenderedPence >= amountPence + tipPence;
}

/** Equal shares of the balance (`pay.splitEvenly`): the last share takes any odd penny. */
export function splitEvenly(balancePence: number, ways: number): number[] {
  const n = Math.max(1, Math.floor(ways));
  const base = Math.floor(balancePence / n);
  const shares = Array.from({ length: n }, () => base);
  shares[n - 1] = balancePence - base * (n - 1);
  return shares;
}

export type AmountProblem = 'empty' | 'zero' | 'exceeds_balance' | 'above_ceiling';

/**
 * Checks the amount to pay now before anything is sent: more than the balance is refused (cash
 * handed over is a separate figure and may be more), and so is more than the venue's largest single
 * payment. Null when the amount can be sent.
 */
export function checkPaymentAmount(input: {
  amountPence: number | null;
  balancePence: number;
  maxPaymentPence?: number | null;
  tipPence?: number;
}): AmountProblem | null {
  const { amountPence, balancePence, maxPaymentPence } = input;
  if (amountPence == null) return 'empty';
  if (amountPence <= 0) return 'zero';
  if (amountPence > balancePence) return 'exceeds_balance';
  const withTip = amountPence + Math.max(0, input.tipPence ?? 0);
  if (maxPaymentPence != null && maxPaymentPence > 0 && withTip > maxPaymentPence) return 'above_ceiling';
  return null;
}

// ─── Tips ───────────────────────────────────────────────────────────────────

export interface TipConfig {
  enabled: boolean;
  percents: number[];
  amounts: number[];
  thresholdPence: number;
  customAllowed: boolean;
  base: 'services' | 'total';
  rule: NonNullable<PosTipSettings['tip_allocation_rule']>;
  policy: string | null;
}

/** The venue's tip settings with the web till's defaults filled in. */
export function tipConfig(s: PosTipSettings | null | undefined): TipConfig {
  return {
    enabled: s?.tipping_enabled === true,
    percents: Array.isArray(s?.tip_percent_presets) && s.tip_percent_presets.length ? s.tip_percent_presets : [10, 15, 20],
    amounts: Array.isArray(s?.tip_amount_presets) && s.tip_amount_presets.length ? s.tip_amount_presets : [100, 200, 300],
    thresholdPence: typeof s?.smart_tip_threshold_pence === 'number' ? s.smart_tip_threshold_pence : 1000,
    customAllowed: s?.tip_custom_allowed !== false,
    base: s?.tip_base === 'total' ? 'total' : 'services',
    rule: s?.tip_allocation_rule ?? 'pro_rata_services',
    policy: s?.tipping_policy?.trim() || null,
  };
}

/**
 * The amount a tip percentage is worked out on: services only or the whole bill, and on part of a
 * bill, the same share of it as the part being paid (plan §4.4.9).
 */
export function tipBasePence(
  sale: Pick<PosSale, 'lines' | 'total_pence'>,
  basis: 'services' | 'total',
  payingPence: number,
): number {
  const full =
    basis === 'total'
      ? sale.total_pence
      : sale.lines.filter((l) => l.reporting_group === 'services').reduce((sum, l) => sum + l.total_pence, 0);
  if (sale.total_pence <= 0 || payingPence >= sale.total_pence) return Math.max(0, full);
  return Math.max(0, roundHalfUp((full * Math.max(0, payingPence)) / sale.total_pence));
}

export type TipSuggestion =
  | { kind: 'percent'; percent: number; amountPence: number }
  | { kind: 'amount'; amountPence: number };

/** Three suggestions: percentages of the base, or fixed amounts when the base is under the smart threshold. */
export function tipSuggestions(input: {
  basePence: number;
  percents: number[];
  amounts: number[];
  thresholdPence: number;
}): TipSuggestion[] {
  const { basePence, percents, amounts, thresholdPence } = input;
  if (basePence < thresholdPence) {
    return amounts.slice(0, 3).map((a) => ({ kind: 'amount' as const, amountPence: Math.round(a) }));
  }
  return percents.slice(0, 3).map((p) => ({
    kind: 'percent' as const,
    percent: p,
    amountPence: roundHalfUp((basePence * p) / 100),
  }));
}

/** Sums tip shares; the editor's Save waits until they match the tip. */
export function allocationTotal(rows: { amount_pence: number }[]): number {
  return rows.reduce((sum, r) => sum + Math.max(0, Math.round(r.amount_pence)), 0);
}

// ─── Discounts ──────────────────────────────────────────────────────────────

export interface DiscountDraft {
  kind: 'percent' | 'amount';
  /** A percentage (12.5) for percent, pence for an amount. */
  value: number;
}

/** What the discount takes off a base, never more than the base. */
export function discountOffPence(draft: DiscountDraft, basePence: number, maxPence?: number | null): number {
  if (!(draft.value > 0) || basePence <= 0) return 0;
  let off =
    draft.kind === 'percent' ? roundHalfUp((basePence * Math.min(draft.value, 100)) / 100) : Math.round(draft.value);
  if (maxPence != null && maxPence > 0) off = Math.min(off, maxPence);
  return Math.max(0, Math.min(off, basePence));
}

/** The base a new discount works on: the whole sale as it stands, or what is left of one line. */
export function discountBasePence(sale: Pick<PosSale, 'total_pence' | 'lines'>, lineId?: string | null): number {
  if (!lineId) return Math.max(0, sale.total_pence);
  const line = sale.lines.find((l) => l.id === lineId);
  if (!line) return 0;
  return Math.max(0, line.unit_price_pence * line.quantity - line.line_discount_pence);
}

/**
 * Whether a staff login's manual discounts, with this one, go over the venue's limit (a hard limit,
 * D44). Measured as a share of the sale's value after automatic discounts. Admins never meet it.
 */
export function overStaffLimit(input: {
  sale: Pick<PosSale, 'subtotal_pence' | 'discounts'>;
  newOffPence: number;
  limitPercent: number;
}): boolean {
  const automatic = input.sale.discounts.filter((d) => !d.is_manual).reduce((s, d) => s + d.applied_pence, 0);
  const manual = input.sale.discounts.filter((d) => d.is_manual).reduce((s, d) => s + d.applied_pence, 0);
  const value = Math.max(0, input.sale.subtotal_pence - automatic);
  if (value <= 0) return input.newOffPence > 0;
  return (manual + input.newOffPence) * 100 > input.limitPercent * value;
}

// ─── Refunds ────────────────────────────────────────────────────────────────

const CARD_METHODS = new Set(['card_reader', 'card_app', 'saved_card', 'pay_link', 'online_checkout']);

export function isCardMethod(method: string): boolean {
  return CARD_METHODS.has(method);
}

/** The money payments that can still give something back, cards first, then in the order taken. */
export function refundablePayments(payments: PosPayment[]): PosPayment[] {
  return payments
    .map((p, i) => ({ p, i }))
    .filter(
      ({ p }) => p.is_money && p.status === 'succeeded' && (p.refundable_pence > 0 || p.refundable_tip_pence > 0),
    )
    .sort((a, b) => {
      const ca = isCardMethod(a.p.method) ? 0 : 1;
      const cb = isCardMethod(b.p.method) ? 0 : 1;
      return ca - cb || a.i - b.i;
    })
    .map(({ p }) => p);
}

/** Everything that can still be refunded, goods only (tips are chosen separately). */
export function maxRefundablePence(payments: PosPayment[]): number {
  return refundablePayments(payments).reduce((sum, p) => sum + p.refundable_pence, 0);
}

export interface RefundableLine {
  line: PosSaleLine;
  remainingQty: number;
  remainingPence: number;
}

/** Lines that can still be refunded, with what is left on each. */
export function refundableLines(sale: Pick<PosSale, 'lines'>): RefundableLine[] {
  return sale.lines
    .map((line) => ({
      line,
      remainingQty: Math.max(0, line.quantity - line.refunded_quantity),
      remainingPence: Math.max(0, line.total_pence - line.refunded_pence),
    }))
    .filter((r) => r.remainingQty > 0 && r.remainingPence > 0);
}

/** What a chosen quantity of one line is worth; all that is left returns everything left. */
export function lineRefundPence(r: RefundableLine, qty: number): number {
  const q = Math.max(0, Math.min(Math.floor(qty), r.remainingQty));
  if (q === 0) return 0;
  if (q === r.remainingQty) return r.remainingPence;
  return Math.min(r.remainingPence, roundHalfUp((r.remainingPence * q) / r.remainingQty));
}

/** The total of the items chosen ({ lineId: quantity }). */
export function itemsRefundPence(lines: RefundableLine[], chosen: Record<string, number>): number {
  return lines.reduce((sum, r) => sum + lineRefundPence(r, chosen[r.line.id] ?? 0), 0);
}

export interface RefundSlice {
  payment_id: string;
  method: string;
  amount_pence: number;
  tip_pence: number;
}

/**
 * Spreads a refund over the payments that can take it, cards first, each up to what it can still
 * give back. Tips chosen for refund ride on their own payment. Returns the slices, and how much
 * could not be placed.
 */
export function spreadRefund(
  payments: PosPayment[],
  amountPence: number,
  tipPaymentIds: ReadonlySet<string> = new Set(),
): { slices: RefundSlice[]; unplaced: number } {
  let left = Math.max(0, Math.round(amountPence));
  const slices: RefundSlice[] = [];
  for (const p of refundablePayments(payments)) {
    const goods = Math.min(left, p.refundable_pence);
    const tip = tipPaymentIds.has(p.id) ? p.refundable_tip_pence : 0;
    left -= goods;
    if (goods > 0 || tip > 0) slices.push({ payment_id: p.id, method: p.method, amount_pence: goods, tip_pence: tip });
  }
  return { slices, unplaced: left };
}

/** Every money payment in full, for "Refund and cancel". */
export function refundEverything(payments: PosPayment[]): RefundSlice[] {
  return refundablePayments(payments).map((p) => ({
    payment_id: p.id,
    method: p.method,
    amount_pence: p.refundable_pence,
    tip_pence: p.refundable_tip_pence,
  }));
}

export function slicesTotal(slices: RefundSlice[]): number {
  return slices.reduce((sum, s) => sum + s.amount_pence + s.tip_pence, 0);
}

// ─── Totals and status ──────────────────────────────────────────────────────

export interface TotalsRow {
  id: PosCopyId;
  /** Signed pence; discounts and payments are negative. */
  amountPence: number;
  tone?: 'strong' | 'balance' | 'note' | 'muted';
}

/** The rows of the totals block, in order, with only the rows that have a value. */
export function totalsRows(sale: PosSale, opts: { vatRegistered: boolean }): TotalsRow[] {
  const rows: TotalsRow[] = [];
  rows.push({ id: 'totals.subtotal', amountPence: sale.subtotal_pence });
  if (sale.discount_pence > 0) rows.push({ id: 'totals.discounts', amountPence: -sale.discount_pence });
  rows.push({ id: 'totals.total', amountPence: sale.total_pence, tone: 'strong' });
  if (opts.vatRegistered && sale.tax_pence > 0) {
    rows.push({ id: 'totals.vatIncluded', amountPence: sale.tax_pence, tone: 'note' });
  }
  const applied = { deposit_applied: 'totals.depositApplied', prior_payment: 'totals.priorPayment' } as const;
  for (const method of ['deposit_applied', 'prior_payment'] as const) {
    const sum = sale.payments
      .filter((p) => p.method === method && p.status === 'succeeded')
      .reduce((s, p) => s + p.amount_pence - p.refunded_pence, 0);
    if (sum > 0) rows.push({ id: applied[method], amountPence: -sum });
  }
  if (sale.status !== 'completed' && sale.returned_pence > 0) {
    rows.push({ id: 'totals.returned', amountPence: -sale.returned_pence });
  }
  const paid = sale.payments
    .filter((p) => p.is_money && p.status === 'succeeded')
    .reduce((s, p) => s + p.amount_pence - p.refunded_pence, 0);
  if (paid > 0) rows.push({ id: 'totals.paid', amountPence: -paid });
  const pendingOnly = Math.max(0, sale.pending_pence - sale.reserved_pence);
  if (pendingOnly > 0) rows.push({ id: 'totals.pending', amountPence: -pendingOnly, tone: 'muted' });
  if (sale.reserved_pence > 0) rows.push({ id: 'totals.linkReserved', amountPence: -sale.reserved_pence, tone: 'muted' });
  const balance = Math.max(0, sale.balance_due_pence);
  rows.push({ id: balance > 0 ? 'totals.balance' : 'totals.balanceZero', amountPence: balance, tone: 'balance' });
  return rows;
}

/** The sale's status pill: parked is an open sale with `parked` set. */
export function saleStatusCopyId(sale: Pick<PosSale, 'status' | 'parked'>): PosCopyId {
  switch (sale.status) {
    case 'open':
      return sale.parked ? 'sale.status.parked' : 'sale.status.open';
    case 'part_paid':
      return 'sale.status.part_paid';
    case 'completed':
      return 'sale.status.completed';
    case 'voided':
      return 'sale.status.voided';
    case 'pending_payment':
      return 'sale.status.pending_payment';
    default:
      return 'sale.status.expired';
  }
}

/** Whether lines, discounts and the client can still change. */
export function saleIsEditable(sale: Pick<PosSale, 'status'>): boolean {
  return sale.status === 'open' || sale.status === 'part_paid';
}

/** A pending card payment blocks every other write until it finishes or is cancelled. */
export function pendingCardPayment(sale: Pick<PosSale, 'payments' | 'payment_lock_payment_id'>): PosPayment | null {
  if (!sale.payment_lock_payment_id) return null;
  return sale.payments.find((p) => p.id === sale.payment_lock_payment_id && p.status === 'pending') ?? null;
}

/** The person-readable name of a payment method, for lists and the completion summary. */
export function paymentMethodName(p: Pick<PosPayment, 'method' | 'payment_type_name' | 'card_brand' | 'card_last4'>): string {
  switch (p.method) {
    case 'cash':
      return 'cash';
    case 'external':
      return p.payment_type_name ?? 'another way';
    case 'deposit_applied':
      return 'deposit paid online';
    case 'prior_payment':
      return 'an earlier payment';
    default:
      if (p.card_brand && p.card_last4) {
        return `${p.card_brand.charAt(0).toUpperCase()}${p.card_brand.slice(1)} ending ${p.card_last4}`;
      }
      return 'card';
  }
}
