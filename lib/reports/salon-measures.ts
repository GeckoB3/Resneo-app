/**
 * Reports release 2 (2026-10-13): the salon measures on the Overview ("Key measures" and "Busiest
 * times"), the Clients tab's rebooking and first-visit retention, and the Team tab, all from
 * GET /api/venue/reports/measures (web `src/lib/reports/salon-measures.ts`; the screens are
 * `reports/release-2-screen-spec.md` in the web repo, word for word, so web and app read the same).
 *
 * Pure: the words, and the figures turned into what the cards show. No em-dashes anywhere here.
 */
import { format, parseISO } from 'date-fns';

import { formatPence } from '@/lib/format';
import { fillCopy, type CopyVars } from '@/lib/pos/copy';
import { describeChange, type ChangeKind, type FigureChange } from '@/lib/reports/report-comparison';
import type {
  ReportScopeEcho,
  SalonBusiestCell,
  SalonCalendarRow,
  SalonCheckoutVisitFigures,
  SalonMeasures,
  SalonNotReturnedClient,
} from '@/types/reports';

export const MEASURES_COPY = {
  // Overview: Key measures
  'key.title': 'Key measures',
  'tile.utilisation': 'Utilisation',
  'tile.rebooking': 'Rebooking rate',
  'tile.avgVisit': 'Average visit value',
  'tile.noShowCost': 'What no-shows cost',
  'tile.retention': 'First-visit retention',
  'null.utilisation': 'No working hours',
  'null.visits': 'No visits yet',
  'null.retention': 'No new clients',
  'sub.utilisation': '{booked} of {working} hours booked',
  'sub.rebooking': '{rebooked} of {eligible} visits',
  'sub.visits': '{visits} visits',
  'sub.checkout': '{spend} at the till, {share} with a product',
  'sub.recovered': '{recovered} kept from deposits and fees',
  'sub.retention': '{returned} of {cohort} came back within 90 days',
  'def.utilisation':
    "Booked time as a share of working time, using each calendar's own hours for each day, less breaks and blocked time. Bookings outside working hours still count, so it can pass 100%.",
  'def.rebooking':
    'Visits where the client left with another booking, either already in the diary or made within 24 hours of the visit. It stops counting if that booking is cancelled.',
  'def.avgVisit': 'The booked value of each visit, without tips. A visit with several services counts once.',
  'def.noShowCost': 'The booked value of no-shows, against the deposits and no-show fees you kept.',
  'def.retention':
    'Of new clients whose first visit was 90 days before these dates, the share who came back within 90 days.',
  'def.noShowRate': 'Of the appointments due, the share where the client did not turn up. Walk-ins are left out.',
  'def.visit': 'A visit is a booking on a day that has passed, or today, that was not cancelled or a no-show.',
  // Overview: Busiest times
  'busiest.title': 'Busiest times',
  'busiest.intro':
    'How much of the working time in each hour was booked, across these dates. Darker is busier. Hours nobody works are blank.',
  'busiest.cell': '{day} {hour}:00, {pct}% booked',
  'busiest.blank': '{day} {hour}:00, nobody works',
  // Team, services & channels
  'teamLink.lead': "See each person's figures on the ",
  'teamLink.link': 'Team tab',
  'teamLink.tail': '.',
  // Clients tab
  'clients.show': 'Show the {n} who have not come back',
  'clients.hide': 'Hide the list',
  'clients.firstVisit': 'First visit {date}',
  'clients.more': 'Showing the {listed} most recent of {total}.',
  // Team tab
  'team.tab': 'Team',
  'team.title': 'Team',
  'team.intro': "Each calendar's figures for these dates, with the change against the earlier period underneath.",
  'team.at': '{name} at {venue}',
  'team.inactive': '{name} (no longer active)',
  'team.total': 'Total',
  'team.none': 'None',
  'team.addUp': 'A visit with services on two calendars counts once on each, so the rows can add up to more than the total.',
  'team.empty': 'No calendars to show for these dates.',
  'team.col.booked': 'Booked value',
  'team.col.visits': 'Visits',
  'team.col.utilisation': 'Utilisation',
  'team.col.rebooking': 'Rebooking',
  'team.col.retention': 'First-visit retention',
  'team.col.avgVisit': 'Average visit value',
  'team.col.noShowRate': 'No-show rate',
  'team.def.noShowRate': 'No-show rate',
} as const;

export type MeasuresCopyId = keyof typeof MEASURES_COPY;

export function measuresCopy(id: MeasuresCopyId, vars: CopyVars = {}): string {
  return fillCopy(MEASURES_COPY[id], vars);
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/** "62.5%" (the server sends 1 dp). */
export function formatMeasurePct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/** Money as the rest of Reports shows it. */
export function formatMeasureMoney(pence: number): string {
  return formatPence(pence) ?? `£${(pence / 100).toFixed(2)}`;
}

/** Minutes as hours to 1 dp: 1278 is "21.3". */
export function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

/** "3 Aug 2026", the app's usual date in Reports. */
export function formatMeasureDate(ymd: string): string {
  try {
    return format(parseISO(`${ymd}T12:00:00`), 'd MMM yyyy');
  } catch {
    return ymd;
  }
}

/** A business or everyone together: names say which business they are at. */
export function isCombinedScope(scope: ReportScopeEcho | null | undefined): boolean {
  return scope?.kind === 'together' || scope?.kind === 'business';
}

// ─── Tiles ───────────────────────────────────────────────────────────────────

export interface MeasureTile {
  key: 'utilisation' | 'rebooking' | 'avgVisit' | 'noShowCost' | 'retention';
  label: string;
  /** The figure, or the null text when there is nothing to divide by. */
  value: string;
  /** Lines under the figure (none when the figure is null). */
  lines: string[];
  change: FigureChange | null;
}

function rebookingTile(totals: SalonMeasures, earlier: SalonMeasures | null | undefined): MeasureTile {
  const pct = totals.rebooking_pct;
  return {
    key: 'rebooking',
    label: measuresCopy('tile.rebooking'),
    value: pct == null ? measuresCopy('null.visits') : formatMeasurePct(pct),
    lines: pct == null ? [] : [measuresCopy('sub.rebooking', { rebooked: totals.rebooked, eligible: totals.rebook_eligible })],
    change: describeChange(pct, earlier?.rebooking_pct, 'rate'),
  };
}

/**
 * The Overview's four tiles, in order: Utilisation, Rebooking rate, Average visit value, What
 * no-shows cost (higher is worse). `checkout` adds the till line under Average visit value where
 * the venue's own sales say something (`service_visits` above 0).
 */
export function keyMeasureTiles(
  totals: SalonMeasures,
  earlier: SalonMeasures | null | undefined,
  checkout: SalonCheckoutVisitFigures | null | undefined,
): MeasureTile[] {
  const util = totals.utilisation_pct;
  const avg = totals.avg_visit_pence;
  const avgLines: string[] = [];
  if (avg != null) avgLines.push(measuresCopy('sub.visits', { visits: totals.visits }));
  if (checkout && checkout.service_visits > 0) {
    avgLines.push(
      measuresCopy('sub.checkout', {
        spend: formatMeasureMoney(checkout.avg_spend_pence ?? 0),
        share: formatMeasurePct(checkout.product_share_pct ?? 0),
      }),
    );
  }
  return [
    {
      key: 'utilisation',
      label: measuresCopy('tile.utilisation'),
      value: util == null ? measuresCopy('null.utilisation') : formatMeasurePct(util),
      lines:
        util == null
          ? []
          : [measuresCopy('sub.utilisation', { booked: formatHours(totals.booked_minutes), working: formatHours(totals.working_minutes) })],
      change: describeChange(util, earlier?.utilisation_pct, 'rate'),
    },
    rebookingTile(totals, earlier),
    {
      key: 'avgVisit',
      label: measuresCopy('tile.avgVisit'),
      value: avg == null ? measuresCopy('null.visits') : formatMeasureMoney(avg),
      lines: avgLines,
      change: describeChange(avg, earlier?.avg_visit_pence, 'money'),
    },
    {
      key: 'noShowCost',
      label: measuresCopy('tile.noShowCost'),
      value: formatMeasureMoney(totals.no_show_value_pence),
      lines: [measuresCopy('sub.recovered', { recovered: formatMeasureMoney(totals.recovered_pence) })],
      change: describeChange(totals.no_show_value_pence, earlier?.no_show_value_pence, 'money', false),
    },
  ];
}

/** The Clients tab's second row: Rebooking rate and First-visit retention. */
export function clientMeasureTiles(totals: SalonMeasures, earlier: SalonMeasures | null | undefined): MeasureTile[] {
  const pct = totals.retention_pct;
  return [
    rebookingTile(totals, earlier),
    {
      key: 'retention',
      label: measuresCopy('tile.retention'),
      value: pct == null ? measuresCopy('null.retention') : formatMeasurePct(pct),
      lines: pct == null ? [] : [measuresCopy('sub.retention', { returned: totals.returned, cohort: totals.cohort })],
      change: describeChange(pct, earlier?.retention_pct, 'rate'),
    },
  ];
}

/** A label in bold, then its sentence. */
export interface MeasureDefinition {
  label: string;
  text: string;
}

export function keyMeasureDefinitions(): MeasureDefinition[] {
  return [
    { label: measuresCopy('tile.utilisation'), text: measuresCopy('def.utilisation') },
    { label: measuresCopy('tile.rebooking'), text: measuresCopy('def.rebooking') },
    { label: measuresCopy('tile.avgVisit'), text: measuresCopy('def.avgVisit') },
    { label: measuresCopy('tile.noShowCost'), text: measuresCopy('def.noShowCost') },
  ];
}

export function clientMeasureDefinitions(): MeasureDefinition[] {
  return [
    { label: measuresCopy('tile.rebooking'), text: measuresCopy('def.rebooking') },
    { label: measuresCopy('tile.retention'), text: measuresCopy('def.retention') },
  ];
}

export function teamDefinitions(): MeasureDefinition[] {
  return [
    { label: measuresCopy('tile.utilisation'), text: measuresCopy('def.utilisation') },
    { label: measuresCopy('tile.rebooking'), text: measuresCopy('def.rebooking') },
    { label: measuresCopy('tile.retention'), text: measuresCopy('def.retention') },
    { label: measuresCopy('tile.avgVisit'), text: measuresCopy('def.avgVisit') },
    { label: measuresCopy('team.def.noShowRate'), text: measuresCopy('def.noShowRate') },
  ];
}

// ─── Busiest times ───────────────────────────────────────────────────────────

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface BusiestGridCell {
  hour: number;
  /** Booked over working, a whole percent; null where nobody works (a blank cell). */
  pct: number | null;
}

export interface BusiestGrid {
  /** From the earliest to the latest hour with any working minutes in the week. */
  hours: number[];
  rows: { weekday: number; label: string; cells: BusiestGridCell[] }[];
}

/** The grid, Monday to Sunday, or null when no cell has working minutes (the card is hidden). */
export function busiestGrid(cells: readonly SalonBusiestCell[] | null | undefined): BusiestGrid | null {
  const byKey = new Map<string, { booked: number; working: number }>();
  let first = 24;
  let last = -1;
  for (const c of cells ?? []) {
    if (!c || c.weekday < 1 || c.weekday > 7 || c.hour < 0 || c.hour > 23) continue;
    const key = `${c.weekday}:${c.hour}`;
    const prev = byKey.get(key) ?? { booked: 0, working: 0 };
    const next = { booked: prev.booked + (c.booked_minutes || 0), working: prev.working + (c.working_minutes || 0) };
    byKey.set(key, next);
    if (next.working > 0) {
      first = Math.min(first, c.hour);
      last = Math.max(last, c.hour);
    }
  }
  if (last < 0) return null;
  const hours: number[] = [];
  for (let h = first; h <= last; h += 1) hours.push(h);
  return {
    hours,
    rows: WEEKDAY_LABELS.map((label, i) => ({
      weekday: i + 1,
      label,
      cells: hours.map((hour) => {
        const cell = byKey.get(`${i + 1}:${hour}`);
        return { hour, pct: cell && cell.working > 0 ? Math.round((cell.booked / cell.working) * 100) : null };
      }),
    })),
  };
}

/** The teal's opacity for a cell: very light at 0%, full at 100% and over. */
export function busiestOpacity(pct: number): number {
  const share = Math.max(0, Math.min(pct, 100)) / 100;
  return Math.round((0.08 + 0.92 * share) * 100) / 100;
}

// ─── Team tab ────────────────────────────────────────────────────────────────

/** "Jess", "Jess at Light 3", with " (no longer active)" for an inactive calendar. */
export function teamRowName(row: Pick<SalonCalendarRow, 'name' | 'venue_name' | 'active'>, combined: boolean): string {
  const name = combined ? measuresCopy('team.at', { name: row.name, venue: row.venue_name }) : row.name;
  return row.active ? name : measuresCopy('team.inactive', { name });
}

export interface TeamFigure {
  key: 'booked' | 'visits' | 'utilisation' | 'rebooking' | 'retention' | 'avgVisit' | 'noShowRate';
  label: string;
  /** The figure, or "None" (with no change). */
  value: string;
  change: FigureChange | null;
}

type TeamColumn = {
  key: TeamFigure['key'];
  label: MeasuresCopyId;
  field: keyof SalonMeasures;
  shape: 'money' | 'count' | 'pct';
  kind: ChangeKind;
  higherIsBetter: boolean;
};

const TEAM_COLUMNS: readonly TeamColumn[] = [
  { key: 'booked', label: 'team.col.booked', field: 'booked_pence', shape: 'money', kind: 'money', higherIsBetter: true },
  { key: 'visits', label: 'team.col.visits', field: 'visits', shape: 'count', kind: 'count', higherIsBetter: true },
  { key: 'utilisation', label: 'team.col.utilisation', field: 'utilisation_pct', shape: 'pct', kind: 'rate', higherIsBetter: true },
  { key: 'rebooking', label: 'team.col.rebooking', field: 'rebooking_pct', shape: 'pct', kind: 'rate', higherIsBetter: true },
  { key: 'retention', label: 'team.col.retention', field: 'retention_pct', shape: 'pct', kind: 'rate', higherIsBetter: true },
  { key: 'avgVisit', label: 'team.col.avgVisit', field: 'avg_visit_pence', shape: 'money', kind: 'money', higherIsBetter: true },
  { key: 'noShowRate', label: 'team.col.noShowRate', field: 'no_show_rate_pct', shape: 'pct', kind: 'rate', higherIsBetter: false },
];

/** The seven figures of a calendar (or the Total), each with its change against `earlier`. */
export function teamFigures(current: SalonMeasures, earlier: SalonMeasures | null | undefined): TeamFigure[] {
  return TEAM_COLUMNS.map((col) => {
    const value = current[col.field];
    const before = earlier ? earlier[col.field] : null;
    if (value == null) return { key: col.key, label: measuresCopy(col.label), value: measuresCopy('team.none'), change: null };
    const shown = col.shape === 'money' ? formatMeasureMoney(value) : col.shape === 'pct' ? formatMeasurePct(value) : String(value);
    return {
      key: col.key,
      label: measuresCopy(col.label),
      value: shown,
      change: describeChange(value, before, col.kind, col.higherIsBetter),
    };
  });
}

// ─── Clients who have not come back ──────────────────────────────────────────

/** The calendar, with " at {business}" in a combined scope; null when there is nothing to say. */
export function notReturnedPlace(item: Pick<SalonNotReturnedClient, 'calendar_name' | 'venue_name'>, combined: boolean): string | null {
  const calendar = item.calendar_name?.trim() || null;
  if (!combined) return calendar;
  if (!calendar) return item.venue_name || null;
  return measuresCopy('team.at', { name: calendar, venue: item.venue_name });
}
