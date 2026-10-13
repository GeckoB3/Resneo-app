/**
 * Comparisons on the Reports headline figures (reports plan, release 1, 2026-10-13): each figure
 * beside the same figure for the previous period of the same length, or, switched, the same dates
 * last year. A port of the web's `src/lib/reports/report-comparison.ts`, rule for rule, so a change
 * reads the same on both (keep the two in step).
 *
 * The contract, shared with the web:
 *   * `compare=previous` (the default) or `compare=last_year` on Overview and Clients, New bookings
 *     and Booked value.
 *   * Each answers `comparison: { basis, from, to, ... }` with the earlier figures under the same
 *     names as the current ones (see each route), for the same scope.
 */

export type ComparisonBasis = 'previous' | 'last_year';

export const COMPARISON_BASES: readonly ComparisonBasis[] = ['previous', 'last_year'];

/** The query parameter. */
export const REPORT_COMPARE_PARAM = 'compare';

export const COMPARISON_BASIS_LABELS: Record<ComparisonBasis, string> = {
  previous: 'Previous period',
  last_year: 'Same dates last year',
};

export function parseComparisonBasis(raw: string | null | undefined): ComparisonBasis {
  return raw === 'last_year' ? 'last_year' : 'previous';
}

/** `ymd` moved by `days` (UTC calendar arithmetic, so no clock change can slip a day). */
function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Inclusive days from `from` to `to`. */
function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** The same calendar date a year earlier; 29 February becomes the 28th. */
function yearEarlier(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(y - 1).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The last day of month `m` (1 to 12) of year `y`. */
function monthEnd(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function ymd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** `value` moved back `months` months, the day kept where the month has it, else its last day. */
function monthsEarlier(value: string, months: number, toMonthEnd = false): string {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) - months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  const last = monthEnd(ty, tm);
  return ymd(ty, tm, toMonthEnd ? last : Math.min(d, last));
}

/**
 * The dates to compare `from`-`to` with. The server works this out itself and answers
 * `comparison.from`/`to`, which is what the app shows; this is the same rule, for any place that
 * needs the dates before the answer arrives.
 *
 * `last_year`: the same dates a year earlier.
 *
 * `previous`: the period just before, lined up the way a diary runs, so like is compared with like:
 *   * a range that starts on the 1st and stays in one month, or ends on a month's last day, is
 *     compared with the same days of the month(s) before ("this month so far", 1 to 13 Oct, with
 *     1 to 13 Sep; all of September with all of August);
 *   * a range that starts on a Monday and is a week or less, or whole weeks, is compared with the
 *     same days of the week(s) before ("this week so far", Mon and Tue, with last Mon and Tue);
 *   * anything else with the days just before it, as many as it has.
 */
export function comparisonRange(from: string, to: string, basis: ComparisonBasis): { from: string; to: string } {
  if (basis === 'last_year') return { from: yearEarlier(from), to: yearEarlier(to) };
  const days = Math.max(1, spanDays(from, to));
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  const toIsMonthEnd = td === monthEnd(ty, tm);
  if (fd === 1 && ((fy === ty && fm === tm) || toIsMonthEnd)) {
    const months = (ty * 12 + tm) - (fy * 12 + fm) + 1;
    return { from: monthsEarlier(from, months), to: monthsEarlier(to, months, toIsMonthEnd) };
  }
  const startsMonday = new Date(`${from}T00:00:00Z`).getUTCDay() === 1;
  if (startsMonday && (days <= 7 || days % 7 === 0)) {
    const shift = 7 * Math.ceil(days / 7);
    return { from: addDaysYmd(from, -shift), to: addDaysYmd(to, -shift) };
  }
  const prevTo = addDaysYmd(from, -1);
  return { from: addDaysYmd(prevTo, -(days - 1)), to: prevTo };
}

/** How a figure is compared: counts and money by percentage, rates by percentage points. */
export type ChangeKind = 'count' | 'money' | 'rate';

export interface FigureChange {
  /** "+12%", "-3%", "+1.5 pts", "Up from 0" or "No change". */
  label: string;
  /** Good, bad or neither, given whether a higher figure is better. */
  tone: 'good' | 'bad' | 'neutral';
}

/**
 * The change from `previous` to `current`, or null when there is nothing to compare (either is
 * missing). `higherIsBetter` false for figures like the cancellation rate.
 */
export function describeChange(
  current: number | null | undefined,
  previous: number | null | undefined,
  kind: ChangeKind,
  higherIsBetter = true,
): FigureChange | null {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const toneFor = (up: boolean): FigureChange['tone'] => (up === higherIsBetter ? 'good' : 'bad');
  if (kind === 'rate') {
    const points = Math.round((current - previous) * 10) / 10;
    if (points === 0) return { label: 'No change', tone: 'neutral' };
    return { label: `${points > 0 ? '+' : '-'}${Math.abs(points).toFixed(1)} pts`, tone: toneFor(points > 0) };
  }
  if (current === previous) return { label: 'No change', tone: 'neutral' };
  if (previous === 0) return { label: 'Up from 0', tone: toneFor(true) };
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (pct === 0) return { label: current > previous ? 'Up under 1%' : 'Down under 1%', tone: toneFor(current > previous) };
  return { label: `${pct > 0 ? '+' : '-'}${Math.abs(pct)}%`, tone: toneFor(pct > 0) };
}
