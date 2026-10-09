import type { CopyVars, PosCopyId, PosT } from '@/lib/pos/copy';
import type { PosDenominations, PosTillReport, PosTillSessionsResponse, PosTillState } from '@/types/pos';

/**
 * Till sessions in the app (POS app step 3, UX spec §7, §13.5): the pure parts, as the web's
 * `src/lib/pos/till/*` does them, so the screens stay thin and this can be tested.
 */

// ─── The notes and coins grid (§7.9) ─────────────────────────────────────────

export interface Denomination {
  /** The key the web stores (`opening_denominations`, `counted_denominations`). */
  key: string;
  pence: number;
  kind: 'note' | 'coin';
}

/** Pound venues (D12): £50 to £5 notes, then £2 to 1p coins. Bagged coin is one amount. */
export const GBP_DENOMINATIONS: readonly Denomination[] = [
  { key: '5000', pence: 5000, kind: 'note' },
  { key: '2000', pence: 2000, kind: 'note' },
  { key: '1000', pence: 1000, kind: 'note' },
  { key: '500', pence: 500, kind: 'note' },
  { key: '200', pence: 200, kind: 'coin' },
  { key: '100', pence: 100, kind: 'coin' },
  { key: '50', pence: 50, kind: 'coin' },
  { key: '20', pence: 20, kind: 'coin' },
  { key: '10', pence: 10, kind: 'coin' },
  { key: '5', pence: 5, kind: 'coin' },
  { key: '2', pence: 2, kind: 'coin' },
  { key: '1', pence: 1, kind: 'coin' },
];

export const BAGGED_KEY = 'bagged';

/** "£50", "£2", "50p", "1p". */
export function denominationValue(pence: number): string {
  return pence >= 100 ? `£${pence / 100}` : `${pence}p`;
}

/** "£50 notes", "50p coins" (`denom.note`, `denom.coin`). */
export function denominationLabel(d: Denomination, t: PosT): string {
  return t(d.kind === 'note' ? 'denom.note' : 'denom.coin', { value: denominationValue(d.pence) });
}

/** What the grid holds while it is typed: a count per note or coin, and bagged coin as money. */
export type DenominationDraft = Record<string, string>;

/** Whole pence from typed money ("12.50", "12"), or null when it is not money. */
export function moneyToPence(text: string): number | null {
  const t = text.trim().replace(/^£/, '').replace(/,/g, '');
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/**
 * The grid as the routes take it, and its total. Empty fields count as none; a count that is not
 * a whole number, or bagged coin that is not money, makes the grid invalid (null).
 */
export function denominationsFromDraft(draft: DenominationDraft): { body: PosDenominations; totalPence: number } | null {
  const body: PosDenominations = {};
  let total = 0;
  for (const d of GBP_DENOMINATIONS) {
    const raw = (draft[d.key] ?? '').trim();
    if (!raw) continue;
    if (!/^\d{1,6}$/.test(raw)) return null;
    const n = Number(raw);
    if (n > 0) {
      body[d.key] = n;
      total += n * d.pence;
    }
  }
  const baggedRaw = (draft[BAGGED_KEY] ?? '').trim();
  if (baggedRaw) {
    const bagged = moneyToPence(baggedRaw);
    if (bagged == null) return null;
    if (bagged > 0) {
      body[BAGGED_KEY] = bagged;
      total += bagged;
    }
  }
  return { body, totalPence: total };
}

// ─── Which till ──────────────────────────────────────────────────────────────

/** A session opened on an earlier trading day (`session.leftOpen`). */
export function isLeftOpen(till: Pick<PosTillState, 'session'> | null | undefined, today: string | null | undefined): boolean {
  return Boolean(till?.session && today && till.session.business_date < today);
}

/**
 * The till "Open the till" opens from a cash payment (UX spec §3.19.1): the sale's own till, then
 * the venue's till for app cash (`legacy_cash_till_id`, which is where cash from a sale with no
 * till goes, plan §4.32 TQ55), then the only active till. Null when the person has to choose.
 */
export function tillForCash(data: Pick<PosTillSessionsResponse, 'tills' | 'cash'>, saleTillId: string | null | undefined): PosTillState | null {
  const active = data.tills.filter((t) => t.is_active);
  if (saleTillId) {
    const own = data.tills.find((t) => t.id === saleTillId);
    if (own) return own;
  }
  if (data.cash.legacy_cash_till_id) {
    const legacy = data.tills.find((t) => t.id === data.cash.legacy_cash_till_id);
    if (legacy) return legacy;
  }
  return active.length === 1 ? active[0]! : null;
}

/** Open sessions first, then the rest in the venue's order. */
export function tillsInOrder(tills: PosTillState[]): PosTillState[] {
  return [...tills].sort((a, b) => Number(Boolean(b.session)) - Number(Boolean(a.session)));
}

/** The float to suggest when opening: what was left last time, else the venue's usual float. */
export function suggestedFloat(till: Pick<PosTillState, 'last_float_left_pence'>, usualPence: number): number {
  return till.last_float_left_pence ?? usualPence;
}

// ─── Closing (§7.4) ──────────────────────────────────────────────────────────

/** `close.balanced`, `close.over` or `close.short`, with the amount. Variance is counted less expected. */
export function varianceWords(variancePence: number, t: PosT, money: (pence: number) => string): string {
  if (variancePence === 0) return t('close.balanced');
  return t(variancePence > 0 ? 'close.over' : 'close.short', { amount: money(Math.abs(variancePence)) });
}

/** The banking step's first figures: the usual float stays (never more than was counted), the rest goes. */
export function defaultBanking(countedPence: number, usualFloatPence: number): { bankPence: number; floatPence: number } {
  const floatPence = Math.max(0, Math.min(usualFloatPence, countedPence));
  return { bankPence: countedPence - floatPence, floatPence };
}

/** Whether the cash to the bank and the float left add up to the count (`close.mismatch`). */
export function bankingAddsUp(countedPence: number, bankPence: number | null, floatPence: number | null): boolean {
  return bankPence != null && floatPence != null && bankPence + floatPence === countedPence;
}

// ─── X and Z reports (§7.5) ──────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card_app: 'Card in the app',
  card_online: 'Card online',
  pay_link: 'Pay by link',
  saved_card: 'Card on file',
  online_checkout: 'Card online',
};

/** "Card reader: Front desk", "Other: Bank transfer", "Cash" (the web's `tillMethodLabel`). */
export function tillMethodLabel(method: string, name: string | null | undefined): string {
  if (method === 'card_reader') return name ? `Card reader: ${name}` : 'Card reader';
  if (method === 'external') return name ? `Other: ${name}` : 'Other';
  if (method === 'card') return 'Card';
  return METHOD_LABELS[method] ?? method;
}

export interface ReportLine {
  label: string;
  value?: string;
  strong?: boolean;
}

export interface ReportSection {
  heading?: string;
  lines: ReportLine[];
}

/**
 * The report's sections in the order of the spec's example (UX spec §7.5), as the web's
 * `tillReportSections` builds them for print, PDF and email. What the reader may not see was
 * taken out on the server, so it is simply absent here.
 */
export function tillReportSections(
  report: PosTillReport,
  f: { t: PosT; money: (pence: number) => string; when: (iso: string) => string },
): ReportSection[] {
  const { t, money, when } = f;
  const out: ReportSection[] = [];
  const head: ReportLine[] = [
    { label: t('z.opened'), value: `${when(report.opened_at)}${report.opened_by_name ? `  by ${report.opened_by_name}` : ''}` },
  ];
  if (report.kind === 'z' && report.closed_at) {
    head.push({ label: t('z.closed'), value: `${when(report.closed_at)}${report.closed_by_name ? `  by ${report.closed_by_name}` : ''}` });
  }
  head.push({ label: t('z.sales'), value: String(report.sales_count) });
  out.push({ lines: head });

  const methods: ReportLine[] = report.by_method.map((r) => ({ label: tillMethodLabel(r.method, r.name), value: money(r.amount_pence) }));
  methods.push({ label: t('app.till.report.totalTaken'), value: money(report.taken_pence), strong: true });
  out.push({ heading: t('z.byMethod'), lines: methods });

  if (report.refunds.length > 0) {
    out.push({
      heading: t('z.refunds'),
      lines: report.refunds.map((r) => ({ label: tillMethodLabel(r.method, r.name), value: money(-r.amount_pence) })),
    });
  }
  out.push({
    lines: [
      {
        label: `${t('z.discounts')}  ${report.discounts.sales} ${report.discounts.sales === 1 ? 'sale' : 'sales'}`,
        value: money(-report.discounts.pence),
      },
      {
        label: `${t('z.voids')}  ${report.voids.sales} ${report.voids.sales === 1 ? 'sale' : 'sales'}`,
        value: `(${money(report.voids.pence)})`,
      },
    ],
  });

  const tips: ReportLine[] = [{ label: t('z.tipsCard'), value: money(report.tips.card_pence) }];
  if (report.tips.cash_pence != null) {
    tips.push({ label: t('z.tipsCash'), value: money(report.tips.cash_pence) });
    tips.push({ label: t('z.tipsOut'), value: money(-report.tips.paid_out_pence) });
  }
  out.push({ heading: t('z.tips'), lines: tips });

  const cash: ReportLine[] = [];
  if (report.cash) {
    const c = report.cash;
    cash.push(
      { label: t('z.float'), value: money(c.float_pence) },
      { label: t('z.cashSales'), value: money(c.sales_pence) },
      { label: t('z.cashTips'), value: money(c.tips_pence) },
    );
    if (c.legacy_pence !== 0) cash.push({ label: t('z.legacyCash'), value: money(c.legacy_pence) });
    cash.push(
      { label: t('z.cashRefunds'), value: money(-c.refunds_pence) },
      { label: t('z.paidIn'), value: money(c.paid_in_pence) },
      { label: t('z.paidOut'), value: money(-c.paid_out_pence) },
      { label: t('z.drops'), value: money(-c.drops_pence) },
      { label: t('app.till.report.tipsPaidOut'), value: money(-c.tips_paid_out_pence) },
      { label: t('z.expected'), value: money(c.expected_pence), strong: true },
    );
  }
  if (report.kind === 'z' && report.counted_cash_pence != null) {
    cash.push({ label: t('z.counted'), value: money(report.counted_cash_pence), strong: true });
    cash.push({ label: t('z.difference'), value: money(report.variance_pence ?? 0) });
    if (report.variance_reason) cash.push({ label: `${t('z.reason')}: ${report.variance_reason}` });
    if (report.cash_to_bank_pence != null) cash.push({ label: t('z.toBank'), value: money(report.cash_to_bank_pence) });
    if (report.float_left_pence != null) cash.push({ label: t('z.floatLeft'), value: money(report.float_left_pence) });
  }
  if (cash.length > 0) out.push({ heading: t('z.cash'), lines: cash });
  return out;
}

/** A download name: "z-report-front-desk-2026-10-09.pdf" (the web's `tillReportFilename`). */
export function tillReportFilename(report: Pick<PosTillReport, 'kind' | 'till_name' | 'business_date'>): string {
  const safe = report.till_name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'till';
  return `${report.kind === 'z' ? 'z-report' : 'x-report'}-${safe}-${report.business_date}`.toLowerCase() + '.pdf';
}

// ─── Movements (§7.3) ────────────────────────────────────────────────────────

export const PAID_IN_CATEGORIES = [
  { value: 'bank', copy: 'move.in.bank' },
  { value: 'float', copy: 'move.in.float' },
  { value: 'other', copy: 'move.in.other' },
] as const satisfies readonly { value: string; copy: PosCopyId }[];

export const PAID_OUT_CATEGORIES = [
  { value: 'petty', copy: 'move.out.petty' },
  { value: 'supplier', copy: 'move.out.supplier' },
  { value: 'expenses', copy: 'move.out.expenses' },
  { value: 'other', copy: 'move.out.other' },
] as const satisfies readonly { value: string; copy: PosCopyId }[];

const MOVE_KINDS: Record<string, PosCopyId> = {
  paid_in: 'move.kind.paid_in',
  paid_out: 'move.kind.paid_out',
  safe_drop: 'move.kind.safe_drop',
  tips_paid_out: 'move.kind.tips_paid_out',
  no_sale: 'move.kind.no_sale',
};

export function movementKindLabel(kind: string, t: (id: PosCopyId, vars?: CopyVars) => string): string {
  const id = MOVE_KINDS[kind];
  return id ? t(id) : kind;
}

/** Money taken out of the drawer reads with a minus. */
export function movementSign(kind: string): 1 | -1 {
  return kind === 'paid_in' ? 1 : -1;
}

/** Tips paid out: the people ticked, with the amounts typed (whole pence, more than nothing). */
export function tipPayouts(
  rows: { calendar_id: string | null; staff_id: string | null; picked: boolean; amountPence: number | null; unpaid_pence: number }[],
): { payouts: { calendar_id?: string; staff_id?: string; amount_pence: number }[]; totalPence: number; valid: boolean } {
  const picked = rows.filter((r) => r.picked);
  const valid =
    picked.length > 0 &&
    picked.every((r) => r.amountPence != null && r.amountPence > 0 && r.amountPence <= r.unpaid_pence && Boolean(r.calendar_id || r.staff_id));
  const payouts = picked
    .filter((r) => r.amountPence != null && r.amountPence > 0)
    .map((r) => ({
      ...(r.calendar_id ? { calendar_id: r.calendar_id } : { staff_id: r.staff_id ?? undefined }),
      amount_pence: r.amountPence ?? 0,
    }));
  return { payouts, totalPence: payouts.reduce((n, p) => n + p.amount_pence, 0), valid };
}

/** "25/09 08:52" in the venue's time zone, as the printed report shows times. */
export function reportWhen(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`;
  } catch {
    return iso.slice(5, 16).replace('T', ' ');
  }
}

/** A business date (YYYY-MM-DD) as people read it: "Thu 9 Oct". */
export function businessDateLabel(ymd: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${ymd}T12:00:00Z`),
    );
  } catch {
    return ymd;
  }
}

/** The day before or after a business date (YYYY-MM-DD). */
export function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
