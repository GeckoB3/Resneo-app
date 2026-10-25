import { bpsToPercentText } from '@/lib/pos/settings-more/commission-copy';
import type {
  CommissionBasis,
  CommissionItemType,
  CommissionPersonLabel,
  CommissionRate,
  SettlementPeriod,
  SplitLabel,
  SplitTermsView,
  SplitView,
} from '@/types/commission-splits';

import { SPLITS_COPY, splitsT } from './splits-copy';
import { ownRateOn, type RatePersonRef } from './team-share';

/**
 * The Commission splits page in words, copied from the web's `src/lib/commission/describe.ts` (its
 * Settings page and this screen say the same thing): what each calendar earns the person who works
 * it, what a business split shares, and the one-sentence summary a form shows before it saves. Pure,
 * so the web and the app say the same thing.
 */

// ---------------------------------------------------------------------------------------------
// A person's share
// ---------------------------------------------------------------------------------------------

export interface ShareTypeView {
  /** The rate in force today. */
  bps: number;
  /** True when it is their own rate, false when it is your standard rate. */
  own: boolean;
  /** Their own rate's next dated change, if any: a rate, or null for "back to your standard rates". */
  next: { date: string; bps: number | null } | null;
}

export interface PersonShareView {
  service: ShareTypeView;
  product: ShareTypeView;
  voucher: ShareTypeView;
  /** Categories that earn something different from the type's rate today. */
  exceptions: { category_id: string; name: string; item_type: CommissionItemType; bps: number }[];
  /** Any own rate in force today (type or category). */
  anyOwn: boolean;
}

function newestOn(rows: CommissionRate[], date: string): CommissionRate | null {
  let newest: CommissionRate | null = null;
  for (const r of rows) {
    if (r.effective_from > date) continue;
    if (!newest || r.effective_from > newest.effective_from || (r.effective_from === newest.effective_from && r.created_at > newest.created_at)) {
      newest = r;
    }
  }
  return newest;
}

const isVenueRow = (r: CommissionRate) => r.calendar_id === null && r.staff_id === null;
const isPersonRow = (r: CommissionRate, p: RatePersonRef) =>
  p.calendar_id ? r.calendar_id === p.calendar_id : r.staff_id !== null && r.staff_id === p.staff_id;

/** Your standard rate for a type today (0 with none). */
export function standardRate(rates: readonly CommissionRate[], type: CommissionItemType, today: string): number {
  return newestOn(rates.filter((r) => isVenueRow(r) && r.item_type === type && r.category_id === null), today)?.rate_bps ?? 0;
}

function typeView(rates: readonly CommissionRate[], type: CommissionItemType, person: RatePersonRef, today: string): ShareTypeView {
  const own = ownRateOn(rates, type, person, today);
  const future = rates
    .filter((r) => isPersonRow(r, person) && r.item_type === type && r.category_id === null && r.effective_from > today)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from) || a.created_at.localeCompare(b.created_at));
  const nextRow = future[0] ?? null;
  return {
    bps: own ?? standardRate(rates, type, today),
    own: own !== null,
    next: nextRow ? { date: nextRow.effective_from, bps: nextRow.rate_bps } : null,
  };
}

export function personShare(rates: readonly CommissionRate[], person: RatePersonRef, today: string): PersonShareView {
  const service = typeView(rates, 'service', person, today);
  const product = typeView(rates, 'product', person, today);
  const voucher = typeView(rates, 'voucher', person, today);
  const byType = { service, product, voucher };

  // Category rates in force today: the person's own, then (where they have no own rate for the type)
  // your standard ones, as SQL's commission__rate ranks them.
  const categories = new Map<string, { rows: CommissionRate[]; personal: boolean }>();
  for (const r of rates) {
    if (r.category_id === null) continue;
    const personal = isPersonRow(r, person);
    if (!personal && !isVenueRow(r)) continue;
    const key = `${personal ? 'p' : 'v'}|${r.item_type}|${r.category_id}`;
    const entry = categories.get(key) ?? { rows: [], personal };
    entry.rows.push(r);
    categories.set(key, entry);
  }
  const chosen = new Map<string, { row: CommissionRate; personal: boolean }>();
  for (const { rows, personal } of categories.values()) {
    const row = newestOn(rows, today);
    if (!row || row.rate_bps === null) continue;
    const at = `${row.item_type}|${row.category_id}`;
    const seen = chosen.get(at);
    // The person's category rate beats yours; yours applies only while they have no own type rate.
    if (!personal && byType[row.item_type].own) continue;
    if (!seen || (personal && !seen.personal)) chosen.set(at, { row, personal });
  }
  const exceptions = [...chosen.values()]
    .filter(({ row }) => row.rate_bps !== byType[row.item_type].bps)
    .map(({ row }) => ({
      category_id: row.category_id!,
      name: row.category_name ?? 'Category',
      item_type: row.item_type,
      bps: row.rate_bps!,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  const anyOwn = service.own || product.own || voucher.own || [...chosen.values()].some((c) => c.personal);
  return { service, product, voucher, exceptions, anyOwn };
}

// ---------------------------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------------------------

/** "Before VAT" becomes "before VAT": only the first letter changes. */
function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return splitsT('what.and', { first: parts.slice(0, -1).join(', '), last: parts[parts.length - 1]! });
}

/** "5% of services and 20% of products"; parts at 0% are left out; null when everything is 0%. */
export function shareWhat(serviceBps: number, productBps: number | null, voucherBps: number | null = null): string | null {
  const parts: string[] = [];
  if (serviceBps > 0) parts.push(splitsT('what.services', { rate: bpsToPercentText(serviceBps) }));
  if (productBps !== null && productBps > 0) parts.push(splitsT('what.products', { rate: bpsToPercentText(productBps) }));
  if (voucherBps !== null && voucherBps > 0) parts.push(splitsT('what.vouchers', { rate: bpsToPercentText(voucherBps) }));
  return parts.length ? joinList(parts) : null;
}

/** "40% of services" or "40% of services and 10% of products", for a business split's terms. */
export function termsWhat(t: Pick<SplitTermsView, 'services_rate_bps' | 'products_rate_bps'>): string {
  return shareWhat(t.services_rate_bps, t.products_rate_bps) ?? splitsT('what.services', { rate: '0' });
}

export function asLabel(label: SplitLabel | CommissionPersonLabel): string {
  return SPLITS_COPY[`as.${label}`];
}

/**
 * "You pay Sophie 5% of services and 20% of products, as commission." Paid only on some categories,
 * it says so (the categories follow in exceptionsSentence); paid nothing, it says that.
 */
export function personShareSentence(name: string, view: PersonShareView, label: CommissionPersonLabel): string {
  const what = shareWhat(view.service.bps, view.product.bps, view.voucher.bps);
  if (what) return splitsT('cal.team.pays', { name, what, label: asLabel(label) });
  if (view.exceptions.length) return splitsT('cal.team.categoriesOnly', { name, label: asLabel(label) });
  return splitsT('cal.team.nothing', { name });
}

/** "Different for Colour (10%)." when categories earn something else. */
export function exceptionsSentence(view: PersonShareView): string | null {
  if (!view.exceptions.length) return null;
  return splitsT('cal.team.except', {
    list: joinList(view.exceptions.map((e) => `${e.name} (${bpsToPercentText(e.bps)}%)`)),
  });
}

/** "From 1 November 2026: 45% of services." for their own rate's next dated change. */
export function nextChangeSentence(view: PersonShareView, dayText: (ymd: string) => string): string | null {
  const changes = (['service', 'product'] as const)
    .map((t) => ({ t, next: view[t].next }))
    .filter((c): c is { t: 'service' | 'product'; next: { date: string; bps: number | null } } => c.next !== null)
    .sort((a, b) => a.next.date.localeCompare(b.next.date));
  const first = changes[0];
  if (!first) return null;
  if (first.next.bps === null) return splitsT('cal.team.nextStandard', { date: dayText(first.next.date) });
  const what =
    first.t === 'service'
      ? splitsT('what.services', { rate: bpsToPercentText(first.next.bps) })
      : splitsT('what.products', { rate: bpsToPercentText(first.next.bps) });
  return splitsT('cal.team.next', { date: dayText(first.next.date), what });
}

/**
 * The live terms a split row describes: the agreed ones, else what is waiting for an answer. A split
 * that was declined or withdrawn before anything was agreed shows what was proposed, as proposed, so
 * it never reads as if it counts.
 */
export function splitShownTerms(s: SplitView): { terms: SplitTermsView; proposed: boolean } | null {
  if (s.terms) return { terms: s.terms, proposed: false };
  if (s.pending) return { terms: s.pending, proposed: true };
  const last = s.history[0];
  return last ? { terms: last, proposed: last.status !== 'accepted' } : null;
}

/** "You pay Aura 20% of services, as rent." or "Proposed: Aura pays you 40% of services, as rent." */
export function splitSentence(s: SplitView): string {
  const shown = splitShownTerms(s);
  return shown ? splitTermsSentence(s, shown.terms, shown.proposed) : splitTermsSentence(s, { services_rate_bps: 0, products_rate_bps: null });
}

/**
 * "Aura pays you 40% of services, as rent." for one version of a split's terms, or "Proposed: ..."
 * for terms that were never agreed.
 */
export function splitTermsSentence(
  s: Pick<SplitView, 'role' | 'partner' | 'label'>,
  terms: Pick<SplitTermsView, 'services_rate_bps' | 'products_rate_bps'>,
  proposed = false,
): string {
  const vars = { partner: s.partner.name, what: termsWhat(terms), label: asLabel(s.label) };
  if (proposed) return splitsT(s.role === 'payer' ? 'cal.biz.proposedYouPay' : 'cal.biz.proposedTheyPay', vars);
  return splitsT(s.role === 'payer' ? 'cal.biz.youPay' : 'cal.biz.theyPay', vars);
}

/**
 * "From 2 November 2026: 35% of services." when new terms are agreed from a later day, so the line
 * that shows today's terms also says what comes next.
 */
export function nextTermsSentence(
  s: Pick<SplitView, 'history' | 'status' | 'terms' | 'ended_on'>,
  today: string,
  dayText: (ymd: string) => string,
): string | null {
  if (s.status !== 'active' && s.status !== 'ended') return null;
  const next = s.history
    .filter((t) => t.status === 'accepted' && t.effective_from > today && t.id !== s.terms?.id && (!s.ended_on || t.effective_from <= s.ended_on))
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from))[0];
  return next ? splitsT('cal.team.next', { date: dayText(next.effective_from), what: termsWhat(next) }) : null;
}

/** "Worked out before VAT, from 1 November 2026. Settle up weekly." */
export function termsDetail(s: Pick<SplitView, 'settlement_period'>, terms: Pick<SplitTermsView, 'vat_basis' | 'effective_from'>, dayText: (ymd: string) => string): string {
  return splitsT('answer.detail', {
    basis: lowerFirst(SPLITS_COPY[`basis.${terms.vat_basis}`]),
    date: dayText(terms.effective_from),
    period: SPLITS_COPY[`sum.period.${s.settlement_period}`],
  });
}

/** Live splits (waiting for an answer, active, or ending but not yet over) show on the calendars; the rest are past. */
export function isLiveSplit(s: Pick<SplitView, 'status' | 'ended_on'>, today: string): boolean {
  return s.status === 'proposed' || s.status === 'active' || (s.status === 'ended' && s.ended_on !== null && s.ended_on >= today);
}

// ---------------------------------------------------------------------------------------------
// The summary a form shows before it saves
// ---------------------------------------------------------------------------------------------

export function teamSummary(input: {
  name: string;
  login: boolean;
  date: string;
  serviceBps: number;
  productBps: number | null;
  label: CommissionPersonLabel;
}): string {
  const what = shareWhat(input.serviceBps, input.productBps);
  if (!what) return splitsT('sum.team.nothing', { date: input.date, name: input.name });
  return splitsT(input.login ? 'sum.team.login' : 'sum.team', {
    date: input.date,
    name: input.name,
    what,
    label: asLabel(input.label),
  });
}

export function businessSummary(input: {
  role: 'payer' | 'payee';
  partner: string;
  calendar: string;
  date: string;
  servicesBps: number;
  productsBps: number | null;
  basis: CommissionBasis;
  label: SplitLabel;
  period: SettlementPeriod;
  /** New terms for an agreed split: the current terms carry on until they are accepted. */
  change?: boolean;
}): string {
  const sentence = splitsT(input.role === 'payer' ? 'sum.biz.youPay' : 'sum.biz.theyPay', {
    date: input.date,
    partner: input.partner,
    calendar: input.calendar,
    what: termsWhat({ services_rate_bps: input.servicesBps, products_rate_bps: input.productsBps }),
    basis: lowerFirst(SPLITS_COPY[`basis.${input.basis}`]),
    label: asLabel(input.label),
    period: SPLITS_COPY[`sum.period.${input.period}`],
  });
  return `${sentence} ${splitsT(input.change ? 'change.help' : 'sum.biz.accept', { partner: input.partner })}`;
}
