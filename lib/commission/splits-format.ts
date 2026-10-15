import { bpsToPercentText } from '@/lib/pos/settings-more/commission-copy';
import { formatLongDay, formatMoneyExact } from '@/lib/reports/pos-report-format';
import type {
  CommissionBasis,
  CommissionPersonLabel,
  SettlementPeriod,
  SplitLabel,
  SplitPeriodView,
  SplitReportRow,
  SplitTermsView,
  SplitView,
} from '@/types/commission-splits';

import { splitsT, type SplitsCopyId } from './splits-copy';

/**
 * How Commission splits reads in words (the web's settings page and report): labels, VAT basis,
 * settle-up periods, a split's direction, its terms in one line, its status, its earlier versions
 * and its statement periods. Pure, so the rules are tested without rendering.
 */

/** The labels a business split can carry, in the order the form offers them. */
export const SPLIT_LABELS: readonly SplitLabel[] = ['rent', 'fee', 'commission', 'their_share'];
/** How a team member can be described. */
export const PERSON_LABELS: readonly CommissionPersonLabel[] = ['commission', 'their_share'];
export const BASES: readonly CommissionBasis[] = ['net_ex_vat', 'net_inc_vat'];
export const PERIODS: readonly SettlementPeriod[] = ['weekly', 'monthly'];

export function labelWords(label: SplitLabel | CommissionPersonLabel): string {
  return splitsT(`label.${label}` as SplitsCopyId);
}

export function basisWords(basis: CommissionBasis): string {
  return splitsT(basis === 'net_inc_vat' ? 'basis.net_inc_vat' : 'basis.net_ex_vat');
}

export function periodWords(period: SettlementPeriod, short = false): string {
  if (period === 'weekly') return splitsT(short ? 'period.weekly.short' : 'period.weekly');
  return splitsT(short ? 'period.monthly.short' : 'period.monthly');
}

/** A label used inside a sentence: "Before VAT" reads "before VAT"; a word like "VAT" keeps its capitals. */
export function lowerFirst(text: string): string {
  if (text.length < 2 || text[1] !== text[1]!.toLowerCase()) return text;
  return text[0]!.toLowerCase() + text.slice(1);
}

/** Money as the reports show it ("£360.00"). */
export function splitMoney(pence: number, currency?: string | null): string {
  return formatMoneyExact(pence, currency ?? 'GBP');
}

/** "40% of services", or "40% of services and 10% of products". */
export function termsSummary(terms: { services_rate_bps: number; products_rate_bps: number | null }): string {
  if (terms.products_rate_bps === null) return splitsT('biz.summary.services', { rate: bpsToPercentText(terms.services_rate_bps) });
  return splitsT('biz.summary.both', {
    services: bpsToPercentText(terms.services_rate_bps),
    products: bpsToPercentText(terms.products_rate_bps),
  });
}

/** "40% of services from 1 November 2026". */
export function termsSummaryFrom(terms: { services_rate_bps: number; products_rate_bps: number | null; effective_from: string }): string {
  return `${termsSummary(terms)} ${splitsT('biz.summary.from', { date: formatLongDay(terms.effective_from) })}`;
}

/** "40% of services, before VAT, from 1 November 2026" (web `termsSummary`). */
export function termsWithBasis(terms: Pick<SplitTermsView, 'services_rate_bps' | 'products_rate_bps' | 'vat_basis' | 'effective_from'>): string {
  return `${termsSummary(terms)}, ${lowerFirst(basisWords(terms.vat_basis))}, ${splitsT('biz.summary.from', { date: formatLongDay(terms.effective_from) })}`;
}

/** The rates in force in a report's range: one in words, or each with the day it started. */
export function reportRatesText(rates: SplitReportRow['rates']): string {
  if (rates.length === 0) return '';
  if (rates.length === 1) return termsSummary(rates[0]!);
  return rates.map((r) => termsSummaryFrom(r)).join('; ');
}

/** "You pay Bloom" or "Sam Cuts pays you". */
export function directionLine(split: { role: 'payer' | 'payee'; partner: { name: string } }): string {
  return split.role === 'payer'
    ? splitsT('biz.youPay', { partner: split.partner.name })
    : splitsT('biz.theyPay', { partner: split.partner.name });
}

/** "Sam at Sam Cuts": the calendar, at the business it belongs to (the one that pays). */
export function calendarAt(split: { calendar: { name: string }; payer: { name: string } }): string {
  return splitsT('biz.calendarAt', { calendar: split.calendar.name, business: split.payer.name });
}

export type StatusTone = 'success' | 'warning' | 'neutral' | 'danger' | 'brand';

/**
 * The split's status as the list and the detail show it (web `biz.status.*`), with a second badge
 * while new terms wait for an answer: "Needs your answer" when the other business proposed them,
 * "Waiting for {partner}" when you did. A split with a last day still to come "Ends after" it.
 */
export function splitBadges(split: SplitView, today: string): { text: string; tone: StatusTone }[] {
  const partner = split.partner.name;
  const waiting = { text: splitsT('biz.status.waiting', { partner }), tone: 'neutral' as const };
  const answer = { text: splitsT('biz.status.needsAnswer'), tone: 'warning' as const };
  if (split.status === 'proposed') {
    const mine = split.pending ? split.pending.proposed_by_you : split.proposed_by_you;
    return [mine ? waiting : answer];
  }
  if (split.status === 'declined') return [{ text: splitsT('biz.status.declined'), tone: 'danger' }];
  if (split.status === 'withdrawn') return [{ text: splitsT('biz.status.withdrawn'), tone: 'neutral' }];
  const ending = split.ended_on !== null && split.ended_on >= today;
  const main =
    ending
      ? { text: splitsT('biz.status.ending', { date: formatLongDay(split.ended_on) }), tone: 'warning' as const }
      : split.status === 'active'
        ? { text: splitsT('biz.status.active'), tone: 'success' as const }
        : { text: splitsT('biz.status.ended'), tone: 'neutral' as const };
  if (!split.pending || split.status !== 'active') return [main];
  return [main, split.pending.proposed_by_you ? waiting : answer];
}

/**
 * One status for a split's line on the calendars (web `splitStatus`): who has to act, or where it
 * stands. New terms the other business proposed on an active split read "Needs your answer"; your
 * own read "Active" (the split's screen shows both, `splitBadges`).
 */
export function splitStatus(split: SplitView, today: string): { text: string; tone: StatusTone } {
  if (split.status === 'proposed') {
    const ours = split.pending ? split.pending.proposed_by_you : split.proposed_by_you;
    return ours
      ? { text: splitsT('biz.status.waiting', { partner: split.partner.name }), tone: 'brand' }
      : { text: splitsT('biz.status.needsAnswer'), tone: 'warning' };
  }
  if (split.status === 'declined') return { text: splitsT('biz.status.declined'), tone: 'neutral' };
  if (split.status === 'withdrawn') return { text: splitsT('biz.status.withdrawn'), tone: 'neutral' };
  if (split.ended_on && split.ended_on >= today) {
    return { text: splitsT('biz.status.ending', { date: formatLongDay(split.ended_on) }), tone: 'warning' };
  }
  if (split.status === 'ended') return { text: splitsT('biz.status.ended'), tone: 'neutral' };
  if (split.pending && !split.pending.proposed_by_you) return { text: splitsT('biz.status.needsAnswer'), tone: 'warning' };
  return { text: splitsT('biz.status.active'), tone: 'success' };
}

/** Why and when an ended split stopped counting (`biz.ended.*`); nothing while it still counts. */
export function endedLines(split: SplitView, today: string): string[] {
  if (split.status !== 'ended' || !split.ended_on || split.ended_on >= today) return [];
  const lines = [splitsT('biz.ended.on', { date: formatLongDay(split.ended_on) })];
  if (split.end_reason === 'link_ended') lines.push(splitsT('biz.ended.link'));
  return lines;
}

const HISTORY_STATUS: Record<SplitTermsView['status'], SplitsCopyId> = {
  accepted: 'biz.history.status.accepted',
  declined: 'biz.history.status.declined',
  withdrawn: 'biz.history.status.withdrawn',
  proposed: 'biz.history.status.proposed',
};

/** "Version 2: 40% of services, before VAT, from 1 November 2026 (agreed)". */
export function historyLine(terms: SplitTermsView): string {
  const line = splitsT('biz.history.version', {
    version: terms.version,
    summary: termsSummary(terms),
    basis: lowerFirst(basisWords(terms.vat_basis)),
    date: formatLongDay(terms.effective_from),
  });
  return `${line} (${splitsT(HISTORY_STATUS[terms.status])})`;
}

/** "1 October 2026 to 31 October 2026". */
export function periodText(period: { start: string; end: string }): string {
  return splitsT('stmt.period', { start: formatLongDay(period.start), end: formatLongDay(period.end) });
}

const STATEMENT_STATUS: Record<SplitPeriodView['status'], SplitsCopyId> = {
  current: 'stmt.status.current',
  outstanding: 'stmt.status.outstanding',
  paid: 'stmt.status.paid',
  nothing_owed: 'stmt.status.nothing_owed',
};

export function statementStatus(period: SplitPeriodView): { text: string; tone: StatusTone } {
  const tone: StatusTone =
    period.status === 'outstanding' ? 'warning' : period.status === 'paid' ? 'success' : period.status === 'current' ? 'brand' : 'neutral';
  return { text: splitsT(STATEMENT_STATUS[period.status]), tone };
}

/**
 * A typed share: a number from 0 to 100 with up to two decimal places (a comma reads as the decimal
 * point). Otherwise the web's words: `ui.percentInvalid`, or `ui.percentPlaces` for a third place.
 */
export function checkPercent(text: string): { ok: true; value: number } | { ok: false; message: string } {
  const trimmed = text.trim().replace(',', '.');
  const match = /^\d+(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return { ok: false, message: splitsT('ui.percentInvalid') };
  const value = Number(trimmed);
  if (!(value >= 0 && value <= 100)) return { ok: false, message: splitsT('ui.percentInvalid') };
  if ((match[1]?.length ?? 0) > 2) return { ok: false, message: splitsT('ui.percentPlaces') };
  return { ok: true, value };
}

/** The day after a YYYY-MM-DD date. */
export function nextDay(ymd: string): string {
  const at = Date.parse(`${ymd}T12:00:00Z`) + 86_400_000;
  return new Date(at).toISOString().slice(0, 10);
}
