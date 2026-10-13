import { ApiError, isApiErrorBody } from '@/lib/api/client';
import { fillCopy, type CopyVars } from '@/lib/pos/copy';
import { CALENDAR_PARAM, parseReportCalendars, reportCalendarLabel, retryReport } from '@/lib/reports/report-calendar';
import { REPORT_COMPARE_PARAM, type ComparisonBasis } from '@/lib/reports/report-comparison';
import type {
  ReportBusinessOption,
  ReportCalendarOption,
  ReportCalendarRef,
  ReportScopeEcho,
  ReportShowingOptions,
} from '@/types/reports';

/**
 * Reports' "Showing" picker (reports plan, release 1, 2026-10-13; web `src/lib/reports/report-scope.ts`
 * and `report-calendar-shared.ts`): your whole venue, one of your calendars, a business you may report
 * on, one of its shared calendars, or everyone together. It extends the one-calendar filter
 * (report-calendar.ts), which still owns `calendar_id` and the "Showing {calendar} only." wording.
 *
 * The contract, shared with the web:
 *   * `GET /api/venue/reports/calendars` answers `{ venue, calendars, businesses, together }`; an older
 *     server sends only `calendars`, read as no businesses and no "together".
 *   * Overview and Clients, New bookings and Booked value take `calendar_id=<uuid>` (yours or a
 *     partner's shared calendar), `business=<venue uuid>` or `business=all`, never both.
 *   * The till reports (Sales, Commission, Tips) take `calendar_id` only for one of your own
 *     calendars, and Takings and Vouchers never take anything: a partner's till money is never shared
 *     (owner decision 2026-10-13).
 *   * Partner and together scopes are for admins only; the server lists no businesses for staff, and
 *     the app never offers them to staff either.
 *   * Each bookings report echoes `scope: { kind, name, business }` beside `calendar`, and what a
 *     section says comes from that echo, so the app never claims a scope the server did not apply.
 */

/** The query parameter for a linked business, or `all` for everyone together. */
export const BUSINESS_PARAM = 'business';
export const BUSINESS_TOGETHER = 'all';

/** The picker's and the notes' words (no em-dash, plain second person, straight apostrophes). */
export const REPORT_SCOPE_COPY = {
  'scope.label': 'Showing',
  'scope.hint': 'Opens the choices of what to show',
  'scope.allOf': '{name}: all calendars',
  'scope.sharedOf': '{name}: shared calendars',
  'scope.calendarAt': '{calendar} at {business}',
  'scope.yourVenue': 'Your venue',
  'scope.partnerCalendar': 'Showing {calendar} at {business} only.',
  'scope.business': 'Showing {business}.',
  'scope.businessDetail':
    'Bookings on the calendars {business} shares with you. Takings and sales are not shared between businesses.',
  'scope.together': 'Showing {together}: {names}.',
  'scope.togetherDetail':
    "Each business's figures are added up, and each one is listed below. A client who visits two businesses counts once at each.",
  'scope.tillTab':
    "These figures are your venue's only: takings and sales are never shared between businesses. {scope} stays chosen on the other tabs.",
  'scope.togetherGroup': 'Together',
  'scope.showYourVenue': 'Show your venue',
  'scope.compareWith': 'Compare with',
  'scope.changesCompare': 'Changes compare with {range}.',
  'scope.byBusiness': 'By business',
  'scope.business.col': 'Business',
  'basis.made': 'Counted on the day each booking was made',
  'basis.date': 'Counted by appointment date',
} as const;

export type ReportScopeCopyId = keyof typeof REPORT_SCOPE_COPY;

export function reportScopeCopy(id: ReportScopeCopyId, vars: CopyVars = {}): string {
  return fillCopy(REPORT_SCOPE_COPY[id], vars);
}

// ─── The choices ─────────────────────────────────────────────────────────────

/** What the picker can hold. */
export type ShowingChoice =
  | { kind: 'venue' }
  | { kind: 'calendar'; calendarId: string }
  | { kind: 'business'; venueId: string }
  | { kind: 'partner-calendar'; venueId: string; calendarId: string }
  | { kind: 'together' };

export const VENUE_CHOICE: ShowingChoice = { kind: 'venue' };

/** A choice checked against the list: what it is called and what it sends. */
export interface ResolvedShowing {
  choice: ShowingChoice;
  kind: ReportScopeEcho['kind'];
  /** The one calendar shown, yours or a partner's. */
  calendar: ReportCalendarRef | null;
  /** The partner shown, for a business or one of its calendars; null for your own venue. */
  business: { venue_id: string; name: string; all_calendars: boolean } | null;
  /**
   * What is shown, in a sentence: the calendar, "{calendar} at {business}", the business, or the
   * together name. Empty for your whole venue.
   */
  name: string;
}

export const WHOLE_VENUE: ResolvedShowing = { choice: VENUE_CHOICE, kind: 'venue', calendar: null, business: null, name: '' };

export const NO_SHOWING_OPTIONS: ReportShowingOptions = { venue: null, calendars: [], businesses: [], together: null };

/** A stable key for a choice (the picker's rows and its selected state). */
export function showingChoiceKey(choice: ShowingChoice): string {
  switch (choice.kind) {
    case 'venue':
      return 'venue';
    case 'calendar':
      return `calendar:${choice.calendarId}`;
    case 'business':
      return `business:${choice.venueId}`;
    case 'partner-calendar':
      return `partner:${choice.venueId}:${choice.calendarId}`;
    case 'together':
      return 'together';
  }
}

function text(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : fallback;
}

/**
 * The calendars response read whole: an older server's `{ calendars }` reads as no businesses and no
 * together; anything unreadable is left out. `allowBusinesses` false (a team member) drops any
 * business and the together choice whatever the server sent.
 */
export function parseReportShowingOptions(body: unknown, allowBusinesses = true): ReportShowingOptions {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const venueRaw = raw.venue as Record<string, unknown> | null | undefined;
  const venue =
    venueRaw && typeof venueRaw === 'object' && typeof venueRaw.id === 'string' && venueRaw.id
      ? { id: venueRaw.id, name: text(venueRaw.name, reportScopeCopy('scope.yourVenue')) }
      : null;
  const calendars = parseReportCalendars(body);
  const businesses: ReportBusinessOption[] = [];
  if (allowBusinesses && Array.isArray(raw.businesses)) {
    const seen = new Set<string>();
    for (const entry of raw.businesses) {
      if (!entry || typeof entry !== 'object') continue;
      const b = entry as Record<string, unknown>;
      if (typeof b.venue_id !== 'string' || !b.venue_id || seen.has(b.venue_id)) continue;
      seen.add(b.venue_id);
      businesses.push({
        venue_id: b.venue_id,
        name: text(b.name, 'Linked venue'),
        access: b.access === 'collective' ? 'collective' : 'link',
        // Only an explicit false is "shared calendars".
        all_calendars: b.all_calendars !== false,
        calendars: parseReportCalendars({ calendars: b.calendars }),
      });
    }
  }
  const togetherRaw = raw.together as Record<string, unknown> | null | undefined;
  const together =
    businesses.length > 0 ? { name: text(togetherRaw && typeof togetherRaw === 'object' ? togetherRaw.name : null, 'Everyone together') } : null;
  return { venue, calendars, businesses, together };
}

/** Your venue's name for "{name}: all calendars". */
export function ownVenueName(options: ReportShowingOptions): string {
  return options.venue?.name ?? reportScopeCopy('scope.yourVenue');
}

function businessAllLabel(b: Pick<ReportBusinessOption, 'name' | 'all_calendars'>): string {
  return reportScopeCopy(b.all_calendars ? 'scope.allOf' : 'scope.sharedOf', { name: b.name });
}

/**
 * The choice checked against the list. A calendar or business that has gone from the list reads as
 * your whole venue, so no report is asked for something the server no longer offers.
 */
export function resolveShowing(options: ReportShowingOptions, choice: ShowingChoice): ResolvedShowing {
  switch (choice.kind) {
    case 'venue':
      return WHOLE_VENUE;
    case 'calendar': {
      const own = options.calendars.find((c) => c.id === choice.calendarId);
      return own
        ? { choice, kind: 'calendar', calendar: { id: own.id, name: own.name }, business: null, name: own.name }
        : WHOLE_VENUE;
    }
    case 'business': {
      const b = options.businesses.find((x) => x.venue_id === choice.venueId);
      return b
        ? { choice, kind: 'business', calendar: null, business: { venue_id: b.venue_id, name: b.name, all_calendars: b.all_calendars }, name: b.name }
        : WHOLE_VENUE;
    }
    case 'partner-calendar': {
      const b = options.businesses.find((x) => x.venue_id === choice.venueId);
      const cal = b?.calendars.find((c) => c.id === choice.calendarId);
      if (!b || !cal) return WHOLE_VENUE;
      return {
        choice,
        kind: 'calendar',
        calendar: { id: cal.id, name: cal.name },
        business: { venue_id: b.venue_id, name: b.name, all_calendars: b.all_calendars },
        name: reportScopeCopy('scope.calendarAt', { calendar: cal.name, business: b.name }),
      };
    }
    case 'together':
      return options.together && options.businesses.length > 0
        ? { choice, kind: 'together', calendar: null, business: null, name: options.together.name }
        : WHOLE_VENUE;
  }
}

/** A partner, one of its calendars, or everyone together: never sent to a till report. */
export function isPartnerShowing(showing: ResolvedShowing): boolean {
  return showing.kind === 'business' || showing.kind === 'together' || showing.business != null;
}

/** The one calendar a till report (Sales, Commission, Tips) may be sent: only one of your own. */
export function tillCalendarId(showing: ResolvedShowing): string | null {
  return showing.kind === 'calendar' && showing.business == null ? (showing.calendar?.id ?? null) : null;
}

/** What a bookings report is sent for the choice. */
export interface ReportScopeQuery {
  calendarId?: string | null;
  business?: string | null;
  compare?: ComparisonBasis | null;
}

/** The bookings reports' scope for a choice: `calendar_id`, `business=<id>` or `business=all`. */
export function bookingScopeQuery(showing: ResolvedShowing): { calendarId: string | null; business: string | null } {
  if (showing.kind === 'calendar') return { calendarId: showing.calendar?.id ?? null, business: null };
  if (showing.kind === 'business') return { calendarId: null, business: showing.business?.venue_id ?? null };
  if (showing.kind === 'together') return { calendarId: null, business: BUSINESS_TOGETHER };
  return { calendarId: null, business: null };
}

/** A hook's scope argument: a calendar id (as before release 1) or the whole query. */
export function normaliseScopeQuery(scope: ReportScopeQuery | string | null | undefined): ReportScopeQuery {
  if (typeof scope === 'string') return { calendarId: scope };
  return scope ?? {};
}

/**
 * A report's query string with the scope and comparison added: `calendar_id` wins over `business`
 * (the server refuses both), and nothing is added for your whole venue, exactly as before.
 */
export function withScopeParams(query: string, scope: ReportScopeQuery | string | null | undefined): string {
  const s = normaliseScopeQuery(scope);
  const parts: string[] = [];
  if (s.calendarId) parts.push(`${CALENDAR_PARAM}=${encodeURIComponent(s.calendarId)}`);
  else if (s.business) parts.push(`${BUSINESS_PARAM}=${encodeURIComponent(s.business)}`);
  if (s.compare) parts.push(`${REPORT_COMPARE_PARAM}=${s.compare}`);
  if (parts.length === 0) return query;
  return query ? `${query}&${parts.join('&')}` : parts.join('&');
}

/** Whether a scope narrows the report (so a refusal is the picker's, and is not retried). */
export function isScopedQuery(scope: ReportScopeQuery | string | null | undefined): boolean {
  const s = normaliseScopeQuery(scope);
  return Boolean(s.calendarId || s.business);
}

/**
 * The query option a bookings report hook spreads in: no retry of a refusal while something is
 * chosen, and the app's default retry for your whole venue, exactly as before.
 */
export function scopeRetryOption(
  scope: ReportScopeQuery | string | null | undefined,
): { retry?: (failureCount: number, error: unknown) => boolean } {
  return isScopedQuery(scope) ? { retry: retryReport } : {};
}

// ─── The picker ──────────────────────────────────────────────────────────────

export interface ShowingPickerRow {
  key: string;
  label: string;
  choice: ShowingChoice;
}

export interface ShowingPickerGroup {
  key: string;
  /** Your venue's name, a business's name, or null (no heading). */
  heading: string | null;
  rows: ShowingPickerRow[];
}

/**
 * The picker's rows, in the web's order. Without businesses: "All calendars" and each calendar, as
 * before. With businesses: your venue ("{name}: all calendars" and each calendar), then each business
 * ("{name}: all calendars", or "shared calendars" when the link shares only some, and each of its
 * calendars), then the together choice under "Together", as the web's picker groups them.
 */
export function showingPickerGroups(options: ReportShowingOptions): ShowingPickerGroup[] {
  const ownRows = (allLabel: string): ShowingPickerRow[] => [
    { key: 'venue', label: allLabel, choice: VENUE_CHOICE },
    ...options.calendars.map((c) => {
      const choice: ShowingChoice = { kind: 'calendar', calendarId: c.id };
      return { key: showingChoiceKey(choice), label: reportCalendarLabel(c), choice };
    }),
  ];
  if (options.businesses.length === 0) {
    return [{ key: 'own', heading: null, rows: ownRows('All calendars') }];
  }
  const venueName = ownVenueName(options);
  const groups: ShowingPickerGroup[] = [
    { key: 'own', heading: venueName, rows: ownRows(reportScopeCopy('scope.allOf', { name: venueName })) },
  ];
  for (const b of options.businesses) {
    const all: ShowingChoice = { kind: 'business', venueId: b.venue_id };
    groups.push({
      key: `business:${b.venue_id}`,
      heading: b.name,
      rows: [
        { key: showingChoiceKey(all), label: businessAllLabel(b), choice: all },
        ...b.calendars.map((c: ReportCalendarOption) => {
          const choice: ShowingChoice = { kind: 'partner-calendar', venueId: b.venue_id, calendarId: c.id };
          return { key: showingChoiceKey(choice), label: reportCalendarLabel(c), choice };
        }),
      ],
    });
  }
  if (options.together) {
    groups.push({
      key: 'together',
      heading: reportScopeCopy('scope.togetherGroup'),
      rows: [{ key: 'together', label: options.together.name, choice: { kind: 'together' } }],
    });
  }
  return groups;
}

/** The picker's closed line: what is chosen, named so it reads alone. */
export function showingPickerLabel(options: ReportShowingOptions, showing: ResolvedShowing): string {
  if (showing.kind === 'venue') {
    return options.businesses.length > 0 ? reportScopeCopy('scope.allOf', { name: ownVenueName(options) }) : 'All calendars';
  }
  if (showing.kind === 'calendar') {
    if (!showing.business) {
      const own = options.calendars.find((c) => c.id === showing.calendar?.id);
      return own ? reportCalendarLabel(own) : showing.name;
    }
    const b = options.businesses.find((x) => x.venue_id === showing.business?.venue_id);
    const cal = b?.calendars.find((c) => c.id === showing.calendar?.id);
    return reportScopeCopy('scope.calendarAt', {
      calendar: cal ? reportCalendarLabel(cal) : (showing.calendar?.name ?? ''),
      business: showing.business.name,
    });
  }
  if (showing.kind === 'business' && showing.business) return businessAllLabel(showing.business);
  return showing.name;
}

/** Whether the picker is worth showing: two own calendars, any business, or something chosen. */
export function showShowingPicker(options: ReportShowingOptions, showing: ResolvedShowing): boolean {
  return options.calendars.length > 1 || options.businesses.length > 0 || showing.kind !== 'venue';
}

// ─── What a section says ─────────────────────────────────────────────────────

/** "A", "A and B", "A, B and C". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The businesses everyone together adds up, yours first, from the list. */
export function togetherNamesFromOptions(options: ReportShowingOptions): string[] {
  return [ownVenueName(options), ...options.businesses.map((b) => b.name)];
}

export type ScopeNote =
  | { kind: 'scoped'; lead: string; detail: string | null }
  | { kind: 'whole-venue' }
  | null;

/**
 * What a bookings section says about the figures on screen, from the answer itself (`scope` and
 * `calendar` echoed) and, for a server before release 1, from `calendar` alone. A choice the answer
 * does not carry reads as the whole venue. Nothing for your whole venue, as before the picker.
 *
 * `detail` is what one calendar's figures are (report-calendar.ts `cal.detail.*`); a business and
 * everyone together have their own. `togetherNames` lists each business, yours first.
 */
export function scopeNote(
  chosen: ResolvedShowing,
  echoed: { calendar?: ReportCalendarRef | null; scope?: ReportScopeEcho | null },
  opts: { detail?: string | null; togetherNames?: readonly string[] } = {},
): ScopeNote {
  const detail = opts.detail ?? null;
  const scope = echoed.scope && typeof echoed.scope === 'object' && typeof echoed.scope.kind === 'string' ? echoed.scope : null;
  const echoedCalendar = echoed.calendar && typeof echoed.calendar.name === 'string' && echoed.calendar.name.trim() ? echoed.calendar : null;
  const calendarLead = (calendarName: string, businessName: string | null) =>
    businessName
      ? reportScopeCopy('scope.partnerCalendar', { calendar: calendarName, business: businessName })
      : fillCopy('Showing {calendar} only.', { calendar: calendarName });
  if (scope) {
    if (scope.kind === 'calendar') {
      const name = echoedCalendar?.name.trim() ?? scope.name;
      return { kind: 'scoped', lead: calendarLead(name, scope.business?.name ?? null), detail };
    }
    if (scope.kind === 'business') {
      return {
        kind: 'scoped',
        lead: reportScopeCopy('scope.business', { business: scope.name }),
        detail: reportScopeCopy('scope.businessDetail', { business: scope.name }),
      };
    }
    if (scope.kind === 'together') {
      const names = opts.togetherNames && opts.togetherNames.length > 0 ? opts.togetherNames : [];
      return {
        kind: 'scoped',
        lead: names.length > 0
          ? reportScopeCopy('scope.together', { together: scope.name, names: listNames(names) })
          : fillCopy('Showing {together}.', { together: scope.name }),
        detail: reportScopeCopy('scope.togetherDetail'),
      };
    }
    return chosen.kind === 'venue' ? null : { kind: 'whole-venue' };
  }
  // A server before release 1: only `calendar` is echoed, and only for one of your own.
  if (echoedCalendar) {
    const partner = chosen.business && chosen.calendar?.id === echoedCalendar.id ? chosen.business.name : null;
    return { kind: 'scoped', lead: calendarLead(echoedCalendar.name.trim(), partner), detail };
  }
  return chosen.kind === 'venue' ? null : { kind: 'whole-venue' };
}

/** The note on a till tab while a partner or everyone together is chosen. */
export function tillScopeText(showing: ResolvedShowing): string | null {
  if (!isPartnerShowing(showing)) return null;
  return reportScopeCopy('scope.tillTab', { scope: showing.name });
}

/**
 * The server's sentence when it refused a bookings report because of the choice, or null for any
 * other failure: 400 VALIDATION_FAILED naming `calendar_id` or `business`, and, while something is
 * chosen, 409 CONFLICT (the filter not ready yet on the server).
 */
export function scopeRefusalMessage(error: unknown, scoped: boolean): string | null {
  if (!(error instanceof ApiError) || !isApiErrorBody(error.body)) return null;
  const body = error.body as { error: string; code?: unknown; fields?: unknown };
  const sentence = body.error.trim();
  if (!sentence) return null;
  if (error.status === 400 && body.code === 'VALIDATION_FAILED' && Array.isArray(body.fields)) {
    const onScope = body.fields.some((f) => {
      const path = !!f && typeof f === 'object' ? (f as { path?: unknown }).path : null;
      return path === CALENDAR_PARAM || path === BUSINESS_PARAM;
    });
    return onScope ? sentence : null;
  }
  if (error.status === 409 && body.code === 'CONFLICT' && scoped) return sentence;
  return null;
}

/**
 * What a CSV the app builds says about the choice (the web's `scopeFileTag` and `scopeCsvLines`):
 * `name` for the file tag, and its first lines, "Showing {calendar} only" (a partner's calendar as
 * "{calendar} at {business}"), "Showing {business}" or "Showing {together}: A, B and C", then a
 * blank line. Null for your whole venue.
 */
export function showingCsvScope(
  showing: ResolvedShowing,
  togetherNames: readonly string[] = [],
): { name: string; lines: string[][] } | null {
  if (showing.kind === 'venue' || !showing.name) return null;
  const lead =
    showing.kind === 'calendar'
      ? `Showing ${showing.name} only`
      : showing.kind === 'together' && togetherNames.length > 0
        ? `Showing ${showing.name}: ${listNames(togetherNames)}`
        : `Showing ${showing.name}`;
  return { name: showing.name, lines: [[lead], []] };
}
