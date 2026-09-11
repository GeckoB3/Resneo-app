/**
 * The client side of the booked-revenue report (web #191,
 * `BookedRevenueSection.tsx` + `src/lib/reports/booked-revenue.ts`): the
 * range choice, the query it becomes, the period labels, the net figure with
 * or without no-shows, the bar colours and the CSV rows. The aggregation
 * itself is the server's; the app reads its answer.
 */
import type {
  BookedRevenueCell,
  BookedRevenueGrain,
  BookedRevenuePreset,
  BookedRevenueReport,
} from '@/types/reports';

export const BOOKED_REVENUE_PRESETS: { id: BookedRevenuePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This week' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_30', label: 'Last 30 days' },
  { id: 'next_30', label: 'Next 30 days' },
];

export const BOOKED_REVENUE_GRAINS: { id: BookedRevenueGrain; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

/**
 * One bar colour per calendar, by position (the web's set). Calendars' own
 * colours are not used: most keep the default blue, so stacked bars in those
 * colours were impossible to tell apart.
 */
export const BOOKED_REVENUE_BAR_COLOURS = [
  '#003B6F', // brand navy
  '#00B4BA', // brand teal
  '#5B8DEF', // soft blue
  '#7FB069', // sage
  '#E9B44C', // warm gold
  '#E07A5F', // coral
  '#9B7BB8', // lavender
  '#3D8B8B', // pine
  '#C9A27E', // sand
  '#6C7A89', // slate
];

export function bookedRevenueBarColour(index: number): string {
  return BOOKED_REVENUE_BAR_COLOURS[index % BOOKED_REVENUE_BAR_COLOURS.length]!;
}

export type BookedRevenueRangeChoice =
  | { kind: 'preset'; preset: BookedRevenuePreset }
  | { kind: 'custom'; from: string; to: string };

/** The query string for a choice and grain (the server resolves presets from the venue's today). */
export function bookedRevenueQuery(choice: BookedRevenueRangeChoice, grain: BookedRevenueGrain): string {
  const p = new URLSearchParams({ grain });
  if (choice.kind === 'preset') p.set('preset', choice.preset);
  else {
    p.set('from', choice.from);
    p.set('to', choice.to);
  }
  return p.toString();
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function formatDayLabel(ymd: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(parseYmd(ymd));
  } catch {
    return ymd;
  }
}

/** The row label for a period, sized to the grain (web `periodLabel`). */
export function bookedRevenuePeriodLabel(start: string, end: string, grain: BookedRevenueGrain): string {
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

/** The short label beside a bar (web `shortChartLabel`). */
export function bookedRevenueChartLabel(start: string, grain: BookedRevenueGrain): string {
  if (grain === 'month') return formatDayLabel(start, { month: 'short', year: '2-digit' });
  return formatDayLabel(start, { day: 'numeric', month: 'short' });
}

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(ymd: string, delta: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + delta);
  return toYmd(d);
}

function endOfMonth(ymd: string): string {
  const d = parseYmd(ymd);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return toYmd(d);
}

function addMonthsKeepingDay(ymd: string, delta: number): string {
  const d = parseYmd(ymd);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + delta);
  const last = endOfMonth(toYmd(d));
  d.setUTCDate(Math.min(day, Number(last.slice(8, 10))));
  return toYmd(d);
}

/**
 * The range one period earlier or later (the app's forward/back arrows,
 * 2026-09-11): a day steps by a day, a week by seven days, a month by a
 * calendar month. The range keeps its length, so "This week" viewed by day
 * walks a seven-day window a day at a time, and a whole calendar month viewed
 * by month walks to the next whole month.
 */
export function shiftBookedRevenueRange(
  range: { from: string; to: string },
  grain: BookedRevenueGrain,
  direction: -1 | 1,
): { from: string; to: string } {
  const { from, to } = range;
  if (grain === 'day') return { from: addDays(from, direction), to: addDays(to, direction) };
  if (grain === 'week') return { from: addDays(from, 7 * direction), to: addDays(to, 7 * direction) };
  const wholeMonths = from.endsWith('-01') && to === endOfMonth(to);
  const nextFrom = addMonthsKeepingDay(from, direction);
  if (wholeMonths) {
    const monthsSpanned =
      (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));
    return { from: nextFrom, to: endOfMonth(addMonthsKeepingDay(nextFrom, monthsSpanned)) };
  }
  return { from: nextFrom, to: addMonthsKeepingDay(to, direction) };
}

/**
 * The longest range the route serves in one call
 * (web `src/app/api/venue/reports/booked-revenue/route.ts:16`).
 */
export const BOOKED_REVENUE_MAX_RANGE_DAYS = 400;

/** Days from `from` to `to`, counted as the route counts them. */
export function bookedRevenueSpanDays(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/**
 * The answer the route would give a bad range, worked out before anything is
 * sent, or null when the range is fine. Same two messages, word for word
 * (web `booked-revenue/route.ts:61-70`).
 */
export function bookedRevenueRangeError(range: { from: string; to: string }): string | null {
  if (range.to < range.from) return 'The end date must not be before the start date.';
  const span = bookedRevenueSpanDays(range.from, range.to);
  if (!Number.isFinite(span) || span > BOOKED_REVENUE_MAX_RANGE_DAYS) {
    return `Choose a range of up to ${BOOKED_REVENUE_MAX_RANGE_DAYS} days.`;
  }
  return null;
}

/**
 * The range the forward/back arrows step from: the last one REQUESTED, never an
 * answer still on screen from an earlier request (the query keeps the previous
 * data while the next range loads, so a second quick tap would otherwise ask for
 * the window it just asked for). A custom range is its own dates; a preset is
 * the server's answer for it, but only once that answer has arrived — while it
 * is placeholder data there is nothing to step from and the arrows wait.
 */
export function bookedRevenueStepBase(
  choice: BookedRevenueRangeChoice,
  data: { from: string; to: string } | undefined,
  isPlaceholderData: boolean,
): { from: string; to: string } | null {
  if (choice.kind === 'custom') return { from: choice.from, to: choice.to };
  if (!data || isPlaceholderData) return null;
  return { from: data.from, to: data.to };
}

/** A cell's net figure: booked, plus no-shows when they are being counted. */
export function bookedRevenueNetPence(cell: BookedRevenueCell | undefined, includeNoShows: boolean): number {
  if (!cell) return 0;
  return cell.booked_pence + (includeNoShows ? cell.no_show_pence : 0);
}

/** A column's display name: the calendar, with its venue for a linked one. */
export function bookedRevenueColumnName(col: { name: string; linked: boolean; venue_name: string }): string {
  return col.linked ? `${col.name} (${col.venue_name})` : col.name;
}

/** The CSV the web exports, row for row. */
export function bookedRevenueCsvRows(data: BookedRevenueReport, includeNoShows: boolean): string[][] {
  const header = ['Period', ...data.columns.map(bookedRevenueColumnName), 'Total', 'No-shows'];
  const money = (pence: number) => (pence / 100).toFixed(2);
  const rows = data.periods.map((p) => [
    bookedRevenuePeriodLabel(p.period_start, p.period_end, data.grain),
    ...data.columns.map((c) => money(bookedRevenueNetPence(p.by_calendar[c.key], includeNoShows))),
    money(bookedRevenueNetPence(p, includeNoShows)),
    money(p.no_show_pence),
  ]);
  rows.push([
    'Total',
    ...data.columns.map((c) => money(bookedRevenueNetPence(data.totals.by_calendar[c.key], includeNoShows))),
    money(bookedRevenueNetPence(data.totals, includeNoShows)),
    money(data.totals.no_show_pence),
  ]);
  return [header, ...rows];
}

export function bookedRevenueCsvFilename(data: BookedRevenueReport): string {
  return `booked-revenue-${data.from}-${data.to}-${data.grain}.csv`;
}
