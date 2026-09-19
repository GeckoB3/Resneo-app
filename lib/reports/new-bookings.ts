/**
 * New bookings (web `src/lib/reports/new-bookings.ts` and `reports/NewBookingsSection.tsx`,
 * 2026-09-18): bookings MADE per day, week or month, whatever date each is for, split by how
 * they came in. The server counts; this module carries the presets, the labels and the CSV.
 */
import type { NewBookingChannel, NewBookingCounts } from '@/types/dashboard';
import type { NewBookingsGrain, NewBookingsPreset, NewBookingsReport } from '@/types/reports';

export const NEW_BOOKING_CHANNELS: readonly NewBookingChannel[] = ['online', 'team', 'walk_in', 'linked_venue'];

export const NEW_BOOKING_CHANNEL_LABELS: Record<NewBookingChannel, string> = {
  online: 'Online',
  team: 'By your team',
  walk_in: 'Walk-ins',
  linked_venue: 'By a linked venue',
};

/** One colour per channel, on the brand navy and teal like the Revenue chart. */
export const NEW_BOOKING_CHANNEL_COLOURS: Record<NewBookingChannel, string> = {
  online: '#00B4BA',
  team: '#003B6F',
  walk_in: '#E9B44C',
  linked_venue: '#9B7BB8',
};

export const NEW_BOOKINGS_PRESETS: { id: NewBookingsPreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
];

export const NEW_BOOKINGS_GRAINS: { id: NewBookingsGrain; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

export type NewBookingsRangeChoice =
  | { kind: 'preset'; preset: NewBookingsPreset }
  | { kind: 'custom'; from: string; to: string };

/** The query string the route takes, in a stable order so it doubles as a cache key. */
export function newBookingsQuery(choice: NewBookingsRangeChoice, grain: NewBookingsGrain): string {
  const p = new URLSearchParams({ grain });
  if (choice.kind === 'preset') p.set('preset', choice.preset);
  else {
    p.set('from', choice.from);
    p.set('to', choice.to);
  }
  return p.toString();
}

/** The server refuses a range over 400 days or a start in the future; say so before asking. */
export const NEW_BOOKINGS_MAX_RANGE_DAYS = 400;

export function newBookingsRangeError(range: { from: string; to: string }, today: string): string | null {
  if (!range.from || !range.to) return 'Choose both dates.';
  if (range.to < range.from) return 'The end date is before the start date.';
  if (range.from > today) return 'The start date is in the future.';
  const days = Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > NEW_BOOKINGS_MAX_RANGE_DAYS) return `Choose a range of ${NEW_BOOKINGS_MAX_RANGE_DAYS} days or fewer.`;
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dmy(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "19 Sep 2026", "15 to 21 Sep 2026", or "September 2026" (web `periodLabel`). */
export function newBookingsPeriodLabel(start: string, end: string, grain: NewBookingsGrain): string {
  if (grain === 'day' || start === end) return dmy(start);
  if (grain === 'month') {
    const [y, m] = start.split('-').map(Number);
    if (y && m) {
      const long = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return `${long[m - 1]} ${y}`;
    }
  }
  return `${dmy(start)} to ${dmy(end)}`;
}

/** The short axis label: "19 Sep", "w/c 15 Sep", "Sep 26". */
export function newBookingsChartLabel(start: string, grain: NewBookingsGrain): string {
  const [y, m, d] = start.split('-').map(Number);
  if (!y || !m || !d) return start;
  if (grain === 'month') return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
  if (grain === 'week') return `w/c ${d} ${MONTHS[m - 1]}`;
  return `${d} ${MONTHS[m - 1]}`;
}

/** "3 of these have since been cancelled. 1 more is waiting for a deposit or card, and will count once paid." */
export function newBookingsFootnote(counts: NewBookingCounts): string | null {
  const parts: string[] = [];
  if (counts.cancelled > 0) {
    parts.push(`${counts.cancelled} of these ${counts.cancelled === 1 ? 'has' : 'have'} since been cancelled.`);
  }
  if (counts.awaiting_payment > 0) {
    parts.push(
      `${counts.awaiting_payment} more ${counts.awaiting_payment === 1 ? 'is' : 'are'} waiting for a deposit or card, and will count once paid.`,
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

export function newBookingsCsvRows(data: NewBookingsReport): string[][] {
  const header = ['Period', 'From', 'To', 'New bookings', ...NEW_BOOKING_CHANNELS.map((c) => NEW_BOOKING_CHANNEL_LABELS[c]), 'Since cancelled', 'Awaiting payment'];
  const line = (label: string, from: string, to: string, c: NewBookingCounts) => [
    label,
    from,
    to,
    String(c.total),
    ...NEW_BOOKING_CHANNELS.map((ch) => String(c.by_channel[ch] ?? 0)),
    String(c.cancelled),
    String(c.awaiting_payment),
  ];
  const rows = data.periods.map((p) => line(newBookingsPeriodLabel(p.period_start, p.period_end, data.grain), p.period_start, p.period_end, p));
  rows.push(line('Total', data.from, data.to, data.totals));
  return [header, ...rows];
}

export function newBookingsCsvFilename(data: NewBookingsReport): string {
  return `new-bookings-${data.from}-${data.to}-${data.grain}.csv`;
}
