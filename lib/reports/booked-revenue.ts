/**
 * The client side of the booked-revenue report (web #191,
 * `BookedRevenueSection.tsx` + `src/lib/reports/booked-revenue.ts`): the
 * range choice, the query it becomes, the period labels, the net figure with
 * or without no-shows, the bar colours, the venue breakdown and its notes, and
 * the CSV rows. The aggregation itself is the server's; the app reads its answer.
 */
import { calendarFileTag, withCalendarCsvLine } from '@/lib/reports/report-calendar';
import { withScopeParams, type ReportScopeQuery } from '@/lib/reports/report-scope';
import type {
  BookedRevenueCell,
  BookedRevenueGrain,
  BookedRevenuePreset,
  BookedRevenueReport,
  BookedRevenueVenueCell,
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

/**
 * The query string for a choice and grain (the server resolves presets from the venue's today),
 * with the Showing picker's scope (`calendar_id` or `business`) and `compare` when given; a bare
 * string is one calendar, as before release 1.
 */
export function bookedRevenueQuery(
  choice: BookedRevenueRangeChoice,
  grain: BookedRevenueGrain,
  scope: ReportScopeQuery | string | null = null,
): string {
  const p = new URLSearchParams({ grain });
  if (choice.kind === 'preset') p.set('preset', choice.preset);
  else {
    p.set('from', choice.from);
    p.set('to', choice.to);
  }
  return withScopeParams(p.toString(), scope);
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

/** The part of a venue's net figure booked through the collective's page (web `collectiveNetPence`). */
export function bookedRevenueCollectiveNetPence(
  cell: BookedRevenueVenueCell | undefined,
  includeNoShows: boolean,
): number {
  if (!cell) return 0;
  return cell.collective_booked_pence + (includeNoShows ? cell.collective_no_show_pence : 0);
}

/** "A", "A and B", "A, B and C" (web `listNames`). */
export function listVenueNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Whether the report is split by venue (web `showVenueBreakdown`): everyone together, or, from a
 * server before release 1 (no `scope`), more than one venue or a collective. An older server sends no venue list, which reads as no breakdown rather than a failure.
 * One calendar is one column of your own (the server leaves partners out), so never with a calendar
 * chosen.
 */
export function showBookedRevenueVenues(
  data: Pick<BookedRevenueReport, 'venues' | 'collective' | 'scope'>,
  calendar: { name: string } | null = null,
): boolean {
  // As the web: never for one calendar; otherwise when there is more than one venue (a business or
  // everyone together) or a collective (its "Through" column, even for your own venue alone).
  if (data.scope && typeof data.scope.kind === 'string') {
    if (data.scope.kind === 'calendar') return false;
  } else if (calendar) return false;
  return (data.venues ?? []).length > 1 || data.collective != null;
}

/**
 * The note naming the other members of this venue's collective (web, collectives D49): every venue
 * in a live collective sees each venue's booked revenue, venue by venue. Null when there are none.
 * They are never described as shared through a linked account: their figures come from the
 * membership, not from a link.
 */
export function bookedRevenueCollectiveNote(data: Pick<BookedRevenueReport, 'venues' | 'collective'>): string | null {
  const collective = data.collective ?? null;
  const names = (data.venues ?? []).filter((v) => v.access === 'collective').map((v) => v.venue_name);
  if (!collective || names.length === 0) return null;
  return `Includes ${listVenueNames(names)}, ${names.length === 1 ? 'which is' : 'which are'} part of ${collective.name} with you. Every venue in a collective sees each venue's booked revenue, venue by venue.`;
}

/**
 * The venues shared through a linked account (web): those the report lists with `access: 'link'`,
 * or, from an older server with no venue list, the venues of the linked columns.
 */
export function bookedRevenueLinkedVenueNames(
  data: Pick<BookedRevenueReport, 'venues' | 'columns'>,
): { names: string[]; fromColumns: boolean } {
  const venues = data.venues ?? [];
  const names = venues.filter((v) => v.access === 'link').map((v) => v.venue_name);
  if (names.length > 0 || venues.length > 0) return { names, fromColumns: false };
  return { names: [...new Set(data.columns.filter((c) => c.linked).map((c) => c.venue_name))], fromColumns: true };
}

/**
 * The CSV the web exports, row for row, with the venue breakdown after the totals when there is one.
 * For one calendar it starts with "Showing {calendar} only" and has no venue breakdown.
 */
export function bookedRevenueCsvRows(
  data: BookedRevenueReport,
  includeNoShows: boolean,
  calendar: { name: string; lines?: string[][] } | null = null,
): string[][] {
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
  if (showBookedRevenueVenues(data, calendar)) {
    const collective = data.collective ?? null;
    rows.push([]);
    rows.push(['Venue', 'Booked revenue', collective ? `Through ${collective.name}` : 'Through a collective page']);
    for (const v of data.venues ?? []) {
      const cell = data.totals.by_venue?.[v.venue_id];
      rows.push([
        v.venue_name,
        money(bookedRevenueNetPence(cell, includeNoShows)),
        money(bookedRevenueCollectiveNetPence(cell, includeNoShows)),
      ]);
    }
  }
  return withCalendarCsvLine([header, ...rows], calendar);
}

/** The web's file name, with the calendar's name in it for one calendar ("booked-revenue-jess-..."). */
export function bookedRevenueCsvFilename(data: BookedRevenueReport, calendar: { name: string } | null = null): string {
  return `booked-revenue${calendarFileTag(calendar)}-${data.from}-${data.to}-${data.grain}.csv`;
}
