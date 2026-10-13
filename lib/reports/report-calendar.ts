import { ApiError, isApiErrorBody } from '@/lib/api/client';
import { fillCopy, type CopyVars } from '@/lib/pos/copy';
import type { ReportCalendarOption, ReportCalendarRef } from '@/types/reports';

/**
 * Reports' calendar filter, to the contract shared with the web (owner, 2026-10-12; web 90ff4d17,
 * `src/app/dashboard/reports/report-calendar-ui.tsx`). A calendar is a diary column (never a
 * resource); choosing one shows only that calendar's figures wherever a report can split by
 * calendar.
 *
 * - The param is `calendar_id=<uuid>`. Without it a report is the whole venue, as it always was.
 * - It is sent to Overview and Clients (`GET /api/venue/reports`), New bookings, Booked value, Sales
 *   and Commission (the admin report), and to their CSVs. Each echoes `calendar: { id, name }`.
 * - Takings is the money journal and stays the whole venue: its route ignores the param, so it is
 *   never sent, nor to its tip records. Cash-ups, payouts, vouchers, stock, the data export, history
 *   and SMS usage are the whole venue too, and say so while a calendar is chosen. On Takings and
 *   Vouchers the picker is greyed out, as on the web.
 * - What a section says comes from the answer it is showing: `calendar` echoed means "Showing
 *   {calendar} only", and no `calendar` while one is chosen means the whole venue, so the app never
 *   claims a filter the server did not apply.
 * - The list is `GET /api/venue/reports/calendars` (admins, and staff with `view_reports`), active
 *   first and then by name; a calendar no longer active may still have history and is labelled so.
 *   The picker shows once there are two.
 * - Before the server's migration a filtered report answers 409 CONFLICT ("Filtering by calendar
 *   isn't ready yet for this report."), the Overview included; a calendar it does not know or that is
 *   not this venue's answers 400 VALIDATION_FAILED on `calendar_id`. The section shows the server's
 *   sentence, word for word, with the way back to all calendars, and every other section still loads.
 * - A filtered CSV the app builds starts with "Showing {calendar} only" and carries the calendar in
 *   its file name, as the server's own CSVs do.
 */

/** The filter's words (house rules: no em-dash, plain second person, straight apostrophes). */
export const REPORT_CALENDAR_COPY = {
  'cal.label': 'Calendar',
  'cal.all': 'All calendars',
  'cal.inactive': '{name} (no longer active)',
  'cal.sheetTitle': 'Show figures for',
  'cal.hint': 'Opens the calendar choices',
  'cal.sheetNote': 'Some figures always cover the whole venue. They say so when you choose a calendar.',
  'cal.showing': 'Showing {calendar} only.',
  'cal.wholeVenue': 'These figures are for the whole venue.',
  'cal.wholeVenueTab': 'These figures are for the whole venue. {calendar} stays chosen on the other tabs.',
  'cal.wholeVenueFiles': 'These files are for the whole venue, whichever calendar you chose above.',
  'cal.showAll': 'Show all calendars',
  'cal.csvShowing': 'Showing {calendar} only',
  // What one calendar's figures are, under "Showing {calendar} only." (the web's words).
  'cal.detail.overview':
    'Bookings on this calendar, and in rooms or other resources shown on it. A visit with services on more than one calendar counts once on each.',
  'cal.detail.clients':
    '{client}s who booked on this calendar in these dates. Known {clientLower}s are those who have ever booked on it. The directory below lists all your {clientLower}s.',
  'cal.detail.newBookings':
    'Bookings with a service on this calendar. A visit with services on more than one calendar counts once on each.',
  'cal.detail.bookedValue': "Just this calendar's column. Other calendars and linked venues are left out.",
  'cal.detail.sales':
    'The services and sales credited to this calendar. When a sale is shared, its payments and discounts are split in proportion.',
  'cal.detail.commission': 'The commission and tips of the person on this calendar.',
} as const;

export type ReportCalendarCopyId = keyof typeof REPORT_CALENDAR_COPY;

export function reportCalendarCopy(id: ReportCalendarCopyId, vars: CopyVars = {}): string {
  return fillCopy(REPORT_CALENDAR_COPY[id], vars);
}

/** The query param that asks a report for one calendar's figures. */
export const CALENDAR_PARAM = 'calendar_id';

/**
 * A report's query string with the chosen calendar added, or unchanged for all calendars. Only the
 * reports that split by calendar are given one; the rest are never sent it.
 */
export function withCalendarParam(query: string, calendarId: string | null | undefined): string {
  if (!calendarId) return query;
  const param = `${CALENDAR_PARAM}=${encodeURIComponent(calendarId)}`;
  return query ? `${query}&${param}` : param;
}

/** A file name's part for one calendar's figures ("-jess"), or nothing for all calendars (web). */
export function calendarFileTag(calendar: { name: string } | null | undefined): string {
  if (!calendar) return '';
  const slug = calendar.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `-${slug}` : '-calendar';
}

/**
 * A CSV the app builds for one calendar: "Showing {calendar} only" and a blank line before the
 * header, as the web's files start. Unchanged for all calendars.
 */
export function withCalendarCsvLine(
  rows: string[][],
  calendar: { name: string; lines?: string[][] } | null | undefined,
): string[][] {
  if (!calendar) return rows;
  // The Showing picker's own first lines (report-scope.ts `showingCsvScope`), for a business or together.
  if (calendar.lines && calendar.lines.length > 0) return [...calendar.lines, ...rows];
  return [[reportCalendarCopy('cal.csvShowing', { calendar: calendar.name })], [], ...rows];
}

/** The calendars list as the server sends it, keeping its order; anything unreadable is left out. */
export function parseReportCalendars(body: unknown): ReportCalendarOption[] {
  const list = (body as { calendars?: unknown } | null)?.calendars;
  if (!Array.isArray(list)) return [];
  const out: ReportCalendarOption[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const { id, name, active } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: typeof name === 'string' && name.trim() ? name.trim() : 'Calendar',
      // Only an explicit false is "no longer active".
      active: active !== false,
    });
  }
  return out;
}

/** A calendar's name in the picker, with "(no longer active)" for one no longer in use. */
export function reportCalendarLabel(option: Pick<ReportCalendarOption, 'name' | 'active'>): string {
  return option.active ? option.name : reportCalendarCopy('cal.inactive', { name: option.name });
}

/** Whether the picker is worth showing: two or more calendars, or one already chosen. */
export function showReportCalendarPicker(options: ReportCalendarOption[], chosenId: string | null): boolean {
  return options.length > 1 || (chosenId != null && options.some((o) => o.id === chosenId));
}

export type CalendarScope = { kind: 'calendar'; name: string } | { kind: 'whole-venue' } | null;

/**
 * What a section says about the figures it is showing: the calendar the server worked them out
 * for, or (while a calendar is chosen) the whole venue when the answer carries none. Nothing while
 * all calendars are chosen and the figures are the whole venue's, as before the filter.
 */
export function calendarScope(
  chosen: ReportCalendarRef | null | undefined,
  echoed: ReportCalendarRef | null | undefined,
): CalendarScope {
  if (echoed && typeof echoed.name === 'string' && echoed.name.trim()) return { kind: 'calendar', name: echoed.name.trim() };
  if (chosen) return { kind: 'whole-venue' };
  return null;
}

/** The line for a scope: "Showing Hannah only." or "These figures are for the whole venue." */
export function calendarScopeText(scope: CalendarScope): string | null {
  if (!scope) return null;
  return scope.kind === 'calendar'
    ? reportCalendarCopy('cal.showing', { calendar: scope.name })
    : reportCalendarCopy('cal.wholeVenue');
}

/**
 * The server's sentence when it refused a report because of the calendar filter, or null for any
 * other failure: 400 VALIDATION_FAILED naming `calendar_id` (a calendar it does not know), and,
 * while a calendar is chosen, 409 CONFLICT ("Filtering by calendar isn't ready yet for this
 * report." before the server's migration).
 */
export function calendarRefusalMessage(error: unknown, calendarChosen: boolean): string | null {
  if (!(error instanceof ApiError) || !isApiErrorBody(error.body)) return null;
  const body = error.body as { error: string; code?: unknown; fields?: unknown };
  const sentence = body.error.trim();
  if (!sentence) return null;
  if (error.status === 400 && body.code === 'VALIDATION_FAILED' && Array.isArray(body.fields)) {
    const onCalendar = body.fields.some(
      (f) => !!f && typeof f === 'object' && (f as { path?: unknown }).path === CALENDAR_PARAM,
    );
    return onCalendar ? sentence : null;
  }
  if (error.status === 409 && body.code === 'CONFLICT' && calendarChosen) return sentence;
  return null;
}

/**
 * Retry policy for a report asked for one calendar: a refusal (400, 403, 404, 409) says the same
 * on a second ask, so it shows at once; anything else is tried once more, as the app's default.
 */
export function retryReport(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && [400, 401, 403, 404, 409].includes(error.status)) return false;
  return failureCount < 1;
}

/**
 * The query option a report hook spreads in: `retryReport` while a calendar is chosen, and nothing
 * (the app's default retry) for the whole venue, so every request made before the filter behaves
 * exactly as it did.
 */
export function calendarRetryOption(
  calendarId: string | null | undefined,
): { retry?: (failureCount: number, error: unknown) => boolean } {
  return calendarId ? { retry: retryReport } : {};
}
