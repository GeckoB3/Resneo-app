import { reportsCopy } from '@/lib/pos/reports-copy';
import type { PosReportPreset } from '@/types/pos';
import type { PosRangeChoice, ReportGrain, VoucherMovement } from '@/types/pos-reports';

/**
 * Pure parts of Reports' POS tabs, in step with the web: the range query, the labels of
 * src/lib/reports/pos-reports.ts and sales-products.ts, the period labels of
 * src/app/dashboard/reports/report-format.ts, the voucher tab's period, the voucher movement words
 * and the voucher import's column guesses. Money is the venue's own currency (`formatMoney`), never
 * a literal pound sign.
 */

// ─── Range and grain ──────────────────────────────────────────────────────────

export const POS_REPORT_PRESETS: PosReportPreset[] = ['today', 'yesterday', 'this-week', 'last-week', 'this-month', 'last-month'];
export const POS_REPORT_GRAINS: ReportGrain[] = ['day', 'week', 'month'];
/** The longest range one call serves (plan §4.18). */
export const POS_REPORT_MAX_DAYS = 400;

/** The query string every POS report route reads (`rangeQuery` on the web). */
export function rangeQuery(choice: PosRangeChoice, grain: ReportGrain): string {
  const p = new URLSearchParams({ grain });
  if (choice.kind === 'preset') p.set('preset', choice.preset);
  else {
    p.set('from', choice.from);
    p.set('to', choice.to);
  }
  return p.toString();
}

/** Days between two Y-M-D dates, both counted. */
export function inclusiveDays(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

/** Why a chosen range cannot be applied (the web's notices), or null when it can. */
export function customRangeProblem(from: string, to: string): string | null {
  if (to < from) return reportsCopy('rng.endBeforeStart');
  if (inclusiveDays(from, to) > POS_REPORT_MAX_DAYS) return reportsCopy('rng.tooLong');
  return null;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

function formatDayLabel(ymd: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(parseYmd(ymd));
  } catch {
    return ymd;
  }
}

/** The row label for a period, sized to the grain ("Mon 5 Oct", "October 2026", "5 to 11 Oct 2026"). */
export function periodLabel(start: string, end: string, grain: ReportGrain): string {
  if (grain === 'day') return formatDayLabel(start, { weekday: 'short', day: 'numeric', month: 'short' });
  if (grain === 'month' && start.slice(0, 7) === end.slice(0, 7) && start.endsWith('-01')) {
    const monthEnd = parseYmd(start);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    monthEnd.setUTCDate(0);
    if (monthEnd.toISOString().slice(0, 10) === end) {
      return formatDayLabel(start, { month: 'long', year: 'numeric' });
    }
  }
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const from = formatDayLabel(start, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  const to = formatDayLabel(end, { day: 'numeric', month: 'short', year: 'numeric' });
  return start === end ? to : `${from} to ${to}`;
}

/** A chart's short axis label for a period. */
export function shortChartLabel(start: string, grain: ReportGrain): string {
  if (grain === 'month') return formatDayLabel(start, { month: 'short', year: '2-digit' });
  return formatDayLabel(start, { day: 'numeric', month: 'short' });
}

/** "8 Oct 2026" for a Y-M-D date (or the date part of a timestamp). */
export function formatReportDate(ymd: string | null | undefined): string {
  if (!ymd) return '';
  const day = ymd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  return formatDayLabel(day, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "3 October 2026" for a Y-M-D date (the commission tab's `dayText`, the voucher dialogs' `formatYmd`). */
export function formatLongDay(ymd: string | null | undefined): string {
  if (!ymd) return '';
  const day = ymd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ymd;
  return formatDayLabel(day, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** `ymd` plus whole months, clamped to the month's last day (the server's `addMonthsToYmd`). */
export function addMonthsToYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The last good day of a voucher as YYYY-MM-DD in the venue's zone, for a date field. */
export function voucherLastDayYmd(expiresAt: string | null | undefined, timeZone: string): string | null {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(
    new Date(at - 1000),
  );
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// ─── Money ────────────────────────────────────────────────────────────────────

/** The currency's symbol, as the web's `currencySymbolFromCode`. */
export function currencySymbol(code: string | null | undefined): string {
  return (code ?? 'GBP').toUpperCase() === 'EUR' ? '€' : '£';
}

/** Money in the venue's currency, as the web's `formatMoney`: "£12", "£12.50", "-£3.40". */
export function formatMoney(pence: number, currency: string | null | undefined = 'GBP'): string {
  const value = Number(pence ?? 0);
  const symbol = currencySymbol(currency);
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(Math.round(Number.isFinite(value) ? value : 0));
  const whole = Math.floor(abs / 100).toLocaleString('en-GB');
  const part = abs % 100;
  return part === 0 ? `${sign}${symbol}${whole}` : `${sign}${symbol}${whole}.${String(part).padStart(2, '0')}`;
}

/** Always two decimals ("£12.00"), as the web's `formatMoneyExact` (the voucher screens). */
export function formatMoneyExact(pence: number, currency: string | null | undefined = 'GBP'): string {
  const value = Number(pence ?? 0);
  const symbol = currencySymbol(currency);
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(Math.round(Number.isFinite(value) ? value : 0));
  return `${sign}${symbol}${Math.floor(abs / 100).toLocaleString('en-GB')}.${String(abs % 100).padStart(2, '0')}`;
}

// ─── Words (src/lib/reports/pos-reports.ts) ───────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  card_reader: 'Card reader',
  card_app: 'Card in the app',
  card_online: 'Card online (deposits, shop and pay links)',
  saved_card: 'Card on file',
  cash: 'Cash',
};

export function takingsMethodLabel(method: string, externalTypeName: string | null | undefined): string {
  if (method === 'external') return externalTypeName?.trim() || 'Other payment type';
  return METHOD_LABELS[method] ?? method;
}

const SOURCE_LABELS: Record<string, string> = {
  checkout: 'Checkout',
  deposits: 'Online deposits',
  fees: 'No-show and late cancellation fees',
  shop: 'Online shop orders',
  classes: 'Class passes and memberships',
  disputes: 'Disputes',
  other: 'Other',
};

export function takingsSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

const REFUND_SOURCE_LABELS: Record<string, string> = {
  pos_refund: 'Checkout refund',
  booking_deposit_refund: 'Deposit refund',
  booking_balance_refund: 'Payment refund',
  card_hold_fee_refund: 'Fee refund',
  class_course_refund: 'Course refund',
};

export function refundSourceLabel(sourceType: string): string {
  return REFUND_SOURCE_LABELS[sourceType] ?? 'Refund';
}

export function refundReasonLabel(reason: string | null | undefined): string {
  return reason?.trim() || 'No reason recorded';
}

/** Who took the money. Online payments have nobody. */
export function takingsPersonLabel(name: string | null | undefined, staffId: string | null | undefined): string {
  if (name?.trim()) return name.trim();
  return staffId ? 'Team member' : 'Online, no team member';
}

export function tipRecipientLabel(name: string | null | undefined, kind: string | null | undefined): string {
  if (kind === 'card_charge_deduction') return 'Card charge deduction';
  if (kind === 'owner_share') return "Owner's share";
  return name?.trim() || 'Team member';
}

export const REPORTING_GROUP_LABELS: Record<string, string> = {
  services: 'Services',
  retail: 'Products',
  other: 'Other items',
};

export const LINE_TYPE_LABELS: Record<string, string> = {
  service: 'Services',
  addon: 'Add-ons',
  class: 'Classes',
  event_ticket: 'Event tickets',
  resource: 'Resource hire',
  product: 'Products',
  custom: 'Custom items',
  fee: 'Fees',
  service_charge: 'Service charges',
  delivery: 'Delivery',
  package: 'Packages',
  membership: 'Memberships',
};

export function discountReasonLabel(reason: string | null | undefined): string {
  return reason?.trim() || 'No reason given';
}

export function vatRateLabel(code: string, rateBps: number): string {
  if (code === 'E') return 'Exempt';
  if (code === 'O') return 'Outside the scope of VAT';
  const pct = rateBps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, '')}%`;
}

const DISPUTE_STATUS_LABELS: Record<string, string> = {
  warning_needs_response: 'Needs a response',
  warning_under_review: 'Under review',
  warning_closed: 'Closed',
  needs_response: 'Needs a response',
  under_review: 'Under review',
  won: 'Won',
  lost: 'Lost',
  charge_refunded: 'Refunded',
};

export function disputeStatusLabel(status: string): string {
  return DISPUTE_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

// ─── Products (src/lib/reports/sales-products.ts) ─────────────────────────────

/** "43.4%" from basis points, or "Not known" when there is no costed revenue. */
export function marginPercentLabel(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps)) return reportsCopy('sl.marginUnknown');
  return `${(bps / 100).toFixed(1)}%`;
}

/** "Bond oil, 100 ml" for a stock row. */
export function stockRowName(r: { product_name: string; option_name: string | null }): string {
  return r.option_name ? `${r.product_name}, ${r.option_name}` : r.product_name;
}

/** Sell-through as a share of what was received in the period, or null when nothing came in. */
export function sellThroughPercent(sold: number, received: number): number | null {
  if (received <= 0) return null;
  return Math.round((sold / received) * 1000) / 10;
}

/** The product cards show once the venue has sold a product or counts stock. */
export function hasProductSections(
  products: { totals: { quantity: number; refunds_pence: number }; stock: { tracked: number } } | null | undefined,
): boolean {
  if (!products) return false;
  return products.totals.quantity > 0 || products.totals.refunds_pence > 0 || products.stock.tracked > 0;
}

// ─── Vouchers ─────────────────────────────────────────────────────────────────

export type VoucherRange = { kind: 'this-month' | 'last-month' } | { kind: 'custom'; from: string; to: string };

/** The period a Vouchers tab range means, in the venue's zone (`voucherReportPeriod`). */
export function voucherReportPeriod(range: VoucherRange, today: string): { from: string; to: string } {
  if (range.kind === 'custom') return { from: range.from, to: range.to };
  const thisMonth = `${today.slice(0, 8)}01`;
  if (range.kind === 'this-month') return { from: thisMonth, to: today };
  const lastStart = addMonthsToYmd(thisMonth, -1);
  const lastEnd = new Date(Date.parse(`${thisMonth}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return { from: lastStart, to: lastEnd };
}

/** "1 voucher", "3 vouchers". */
export function voucherCount(count: number): string {
  return count === 1 ? reportsCopy('rep.v.count.one') : reportsCopy('rep.v.count.many', { count });
}

/** A number from the SQL report, which may come as a string. */
export function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : Number(v ?? 0) || 0;
}

/** What one voucher movement says, in the deck's words (`movementWords`). */
export function movementWords(m: VoucherMovement, ctx: { lastDay: string | null; newestExtendId: string | null }): string {
  const saleNo = m.sale_number ?? '';
  switch (m.kind) {
    case 'issue':
      return reportsCopy('vch.mov.issue');
    case 'redeem':
      return reportsCopy('vch.mov.redeem', { saleNo });
    case 'redeem_reversal':
      return reportsCopy('vch.mov.redeem_reversal', { saleNo });
    case 'refund_in':
      return reportsCopy('vch.mov.refund_in', { saleNo });
    case 'expire':
      return reportsCopy('vch.mov.expire');
    case 'extend':
      // The movement does not carry the new date: the newest one names today's use-by date.
      if (m.id === ctx.newestExtendId) {
        return ctx.lastDay ? reportsCopy('vch.mov.extend', { date: ctx.lastDay }) : reportsCopy('vch.noExpiry');
      }
      return m.reason ?? reportsCopy('vch.extend');
    case 'adjust':
      return reportsCopy('vch.mov.adjust', { staffName: m.staff_name ?? '', reason: m.reason ?? '' });
    case 'cancel':
      return reportsCopy('vch.mov.cancel', { reason: m.reason ?? '' });
    default:
      return m.reason ?? m.kind;
  }
}

/** Whether a held voucher is held for a payment dispute (web `voucherHoldKind`, `disputeFreezeReason`). */
export function isDisputeHold(status: string, frozenReason: string | null | undefined): boolean {
  return status === 'frozen' && typeof frozenReason === 'string' && frozenReason.startsWith('Payment disputed (');
}

// ─── Voucher import (VoucherImportDialog.tsx) ─────────────────────────────────

export type ImportColumnKey = 'code' | 'balance' | 'expiry' | 'holder_name' | 'holder_email' | 'note';

export const IMPORT_COLUMNS: { key: ImportColumnKey; required?: boolean; guess: RegExp }[] = [
  { key: 'code', guess: /code|number|voucher/i },
  { key: 'balance', required: true, guess: /amount|balance|left|value/i },
  { key: 'expiry', guess: /expir|use by|valid|until/i },
  { key: 'holder_name', guess: /name|holder/i },
  { key: 'holder_email', guess: /e-?mail/i },
  { key: 'note', guess: /note|comment/i },
];

/** The template the web offers, column for column. */
export const IMPORT_TEMPLATE =
  "Code,Amount left,Use by,\"Holder's name\",\"Holder's email\",Note\r\nAB12CD34,25.00,31/12/2026,Sam Smith,sam@example.com,Paper voucher 101\r\n";

/** The largest file the import takes. */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** First guesses for each column from the file's headers; each header used once. */
export function guessColumns(headers: string[]): Partial<Record<ImportColumnKey, string>> {
  const out: Partial<Record<ImportColumnKey, string>> = {};
  const used = new Set<string>();
  // Email before name, so "Holder's email" is not taken as the name.
  for (const key of ['holder_email', 'balance', 'expiry', 'code', 'holder_name', 'note'] as ImportColumnKey[]) {
    const col = IMPORT_COLUMNS.find((c) => c.key === key)!;
    const hit = headers.find((h) => !used.has(h) && col.guess.test(h));
    if (hit) {
      out[key] = hit;
      used.add(hit);
    }
  }
  return out;
}

/**
 * The header row of a CSV file: the first non-empty record, quoted cells honoured (a quoted cell
 * may hold commas, doubled quotes and line breaks). The server parses the whole file again.
 */
export function csvHeaderRow(text: string): string[] {
  const src = text.replace(/^﻿/, '');
  let i = 0;
  while (i < src.length) {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    let ended = false;
    for (; i < src.length; i++) {
      const ch = src[i]!;
      if (quoted) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            cell += '"';
            i++;
          } else quoted = false;
        } else cell += ch;
        continue;
      }
      if (ch === '"') quoted = true;
      else if (ch === ',') {
        cells.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        i++;
        ended = true;
        break;
      } else cell += ch;
    }
    cells.push(cell);
    const head = cells.map((c) => c.trim()).filter(Boolean);
    if (head.length > 0) return head;
    if (!ended) break;
  }
  return [];
}

/** The name the server gave a file, from Content-Disposition, or the fallback. */
export function filenameFromDisposition(header: string | null | undefined, fallback: string): string {
  const match = /filename="([^"]+)"/.exec(header ?? '');
  const name = match?.[1]?.trim();
  return name && !/[\\/]/.test(name) ? name : fallback;
}
