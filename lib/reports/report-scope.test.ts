/**
 * The Showing picker's rules (reports plan, release 1, 2026-10-13; the contract shared with the web's
 * report-scope.ts): reading the calendars response, the picker's choices and order, what each choice
 * sends (till reports never a partner or a business), what a section says, and which refusals are
 * the picker's.
 */
import { ApiError } from '@/lib/api/client';
import {
  bookingScopeQuery,
  isPartnerShowing,
  listNames,
  parseReportShowingOptions,
  resolveShowing,
  scopeNote,
  scopeRefusalMessage,
  showingCsvScope,
  showingPickerGroups,
  showingPickerLabel,
  showShowingPicker,
  tillCalendarId,
  tillScopeText,
  withScopeParams,
  WHOLE_VENUE,
} from '@/lib/reports/report-scope';
import type { ReportShowingOptions } from '@/types/reports';

const BODY = {
  venue: { id: 'v1', name: 'Plus 1' },
  calendars: [
    { id: 'c1', name: 'Hannah', active: true },
    { id: 'c2', name: 'Jo', active: false },
  ],
  businesses: [
    { venue_id: 'v2', name: 'Light 3', access: 'collective', all_calendars: true, calendars: [{ id: 'p1', name: 'Jess', active: true }] },
    { venue_id: 'v3', name: 'Aura', access: 'link', all_calendars: false, calendars: [{ id: 'p2', name: 'Kim', active: true }] },
  ],
  together: { name: 'Everyone together' },
};
const OPTIONS: ReportShowingOptions = parseReportShowingOptions(BODY);

describe('parseReportShowingOptions', () => {
  it('reads the whole answer', () => {
    expect(OPTIONS.venue).toEqual({ id: 'v1', name: 'Plus 1' });
    expect(OPTIONS.calendars.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(OPTIONS.businesses).toEqual([
      { venue_id: 'v2', name: 'Light 3', access: 'collective', all_calendars: true, calendars: [{ id: 'p1', name: 'Jess', active: true }] },
      { venue_id: 'v3', name: 'Aura', access: 'link', all_calendars: false, calendars: [{ id: 'p2', name: 'Kim', active: true }] },
    ]);
    expect(OPTIONS.together).toEqual({ name: 'Everyone together' });
  });

  it("reads an older server's calendars alone as no businesses and no together", () => {
    const older = parseReportShowingOptions({ calendars: [{ id: 'c1', name: 'Hannah' }] });
    expect(older).toEqual({ venue: null, calendars: [{ id: 'c1', name: 'Hannah', active: true }], businesses: [], together: null });
    expect(parseReportShowingOptions(null)).toEqual({ venue: null, calendars: [], businesses: [], together: null });
  });

  it('never offers a team member a business, whatever the server sent', () => {
    const staff = parseReportShowingOptions(BODY, false);
    expect(staff.businesses).toEqual([]);
    expect(staff.together).toBeNull();
  });
});

describe('the picker', () => {
  it('without businesses is exactly the calendar filter', () => {
    const own = { ...OPTIONS, businesses: [], together: null };
    expect(showingPickerGroups(own)).toEqual([
      {
        key: 'own',
        heading: null,
        rows: [
          { key: 'venue', label: 'All calendars', choice: { kind: 'venue' } },
          { key: 'calendar:c1', label: 'Hannah', choice: { kind: 'calendar', calendarId: 'c1' } },
          { key: 'calendar:c2', label: 'Jo (no longer active)', choice: { kind: 'calendar', calendarId: 'c2' } },
        ],
      },
    ]);
  });

  it('with businesses groups your venue, each business, then together', () => {
    const groups = showingPickerGroups(OPTIONS);
    expect(groups.map((g) => g.heading)).toEqual(['Plus 1 (you)', 'Light 3', 'Aura', 'Together']);
    expect(groups.flatMap((g) => g.rows.map((r) => r.label))).toEqual([
      'Plus 1 (you): all calendars',
      'Hannah',
      'Jo (no longer active)',
      'Light 3: all calendars',
      'Jess',
      'Aura: shared calendars',
      'Kim',
      'Everyone together',
    ]);
  });

  it('is hidden only when there is nothing to choose between', () => {
    const one = { venue: null, calendars: [{ id: 'c1', name: 'Hannah', active: true }], businesses: [], together: null };
    expect(showShowingPicker(one, WHOLE_VENUE)).toBe(false);
    expect(showShowingPicker(one, resolveShowing(one, { kind: 'calendar', calendarId: 'c1' }))).toBe(true);
    expect(showShowingPicker({ ...one, businesses: OPTIONS.businesses }, WHOLE_VENUE)).toBe(true);
    expect(showShowingPicker(OPTIONS, WHOLE_VENUE)).toBe(true);
  });

  it('names what is chosen on its closed line', () => {
    expect(showingPickerLabel(OPTIONS, WHOLE_VENUE)).toBe('Plus 1 (you): all calendars');
    expect(showingPickerLabel({ ...OPTIONS, businesses: [] }, WHOLE_VENUE)).toBe('All calendars');
    expect(showingPickerLabel(OPTIONS, resolveShowing(OPTIONS, { kind: 'partner-calendar', venueId: 'v2', calendarId: 'p1' }))).toBe(
      'Jess at Light 3',
    );
    expect(showingPickerLabel(OPTIONS, resolveShowing(OPTIONS, { kind: 'business', venueId: 'v3' }))).toBe('Aura: shared calendars');
    expect(showingPickerLabel(OPTIONS, resolveShowing(OPTIONS, { kind: 'together' }))).toBe('Everyone together');
  });

  it('reads a choice that has gone from the list as your whole venue', () => {
    expect(resolveShowing(OPTIONS, { kind: 'calendar', calendarId: 'gone' })).toBe(WHOLE_VENUE);
    expect(resolveShowing(OPTIONS, { kind: 'business', venueId: 'gone' })).toBe(WHOLE_VENUE);
    expect(resolveShowing(OPTIONS, { kind: 'partner-calendar', venueId: 'v2', calendarId: 'p2' })).toBe(WHOLE_VENUE);
    expect(resolveShowing({ ...OPTIONS, businesses: [], together: null }, { kind: 'together' })).toBe(WHOLE_VENUE);
  });
});

describe('what each choice sends', () => {
  const cases = [
    { choice: { kind: 'venue' } as const, bookings: '', till: null },
    { choice: { kind: 'calendar', calendarId: 'c1' } as const, bookings: 'calendar_id=c1', till: 'c1' },
    { choice: { kind: 'partner-calendar', venueId: 'v2', calendarId: 'p1' } as const, bookings: 'calendar_id=p1', till: null },
    { choice: { kind: 'business', venueId: 'v3' } as const, bookings: 'business=v3', till: null },
    { choice: { kind: 'together' } as const, bookings: 'business=all', till: null },
  ];

  it.each(cases)('$choice.kind: the bookings reports get the scope, a till report only your own calendar', ({ choice, bookings, till }) => {
    const showing = resolveShowing(OPTIONS, choice);
    expect(withScopeParams('', bookingScopeQuery(showing))).toBe(bookings);
    expect(tillCalendarId(showing)).toBe(till);
    expect(isPartnerShowing(showing)).toBe(choice.kind === 'partner-calendar' || choice.kind === 'business' || choice.kind === 'together');
  });

  it('adds the comparison, never both a calendar and a business, and nothing for the whole venue', () => {
    expect(withScopeParams('from=a&to=b', { business: 'all', compare: 'last_year' })).toBe('from=a&to=b&business=all&compare=last_year');
    expect(withScopeParams('from=a&to=b', { calendarId: 'c1', business: 'v2' })).toBe('from=a&to=b&calendar_id=c1');
    expect(withScopeParams('from=a&to=b', {})).toBe('from=a&to=b');
    expect(withScopeParams('from=a&to=b', null)).toBe('from=a&to=b');
    // A bare string is one calendar, as before release 1.
    expect(withScopeParams('from=a&to=b', 'c1')).toBe('from=a&to=b&calendar_id=c1');
  });

  it("starts a CSV with the web's Showing line for each choice", () => {
    expect(showingCsvScope(resolveShowing(OPTIONS, { kind: 'partner-calendar', venueId: 'v2', calendarId: 'p1' }))).toEqual({
      name: 'Jess at Light 3',
      lines: [['Showing Jess at Light 3 only'], []],
    });
    expect(showingCsvScope(resolveShowing(OPTIONS, { kind: 'business', venueId: 'v2' }))).toEqual({
      name: 'Light 3',
      lines: [['Showing Light 3'], []],
    });
    expect(showingCsvScope(resolveShowing(OPTIONS, { kind: 'together' }), ['Plus 1', 'Light 3', 'Aura'])).toEqual({
      name: 'Everyone together',
      lines: [['Showing Everyone together: Plus 1, Light 3 and Aura'], []],
    });
    expect(showingCsvScope(WHOLE_VENUE)).toBeNull();
  });
});

describe('what a section says', () => {
  const light3 = { venue_id: 'v2', name: 'Light 3', access: 'collective' as const };

  it('names one calendar, yours or a partner', () => {
    const own = resolveShowing(OPTIONS, { kind: 'calendar', calendarId: 'c1' });
    expect(scopeNote(own, { calendar: { id: 'c1', name: 'Hannah' }, scope: { kind: 'calendar', name: 'Hannah', business: null } }, { detail: 'D.' })).toEqual({
      kind: 'scoped',
      lead: 'Showing Hannah only.',
      detail: 'D.',
    });
    const partner = resolveShowing(OPTIONS, { kind: 'partner-calendar', venueId: 'v2', calendarId: 'p1' });
    expect(scopeNote(partner, { calendar: { id: 'p1', name: 'Jess' }, scope: { kind: 'calendar', name: 'Jess', business: light3 } }, { detail: 'D.' })).toEqual({
      kind: 'scoped',
      lead: 'Showing Jess at Light 3 only.',
      detail: 'D.',
    });
  });

  it('says what a business and everyone together are', () => {
    const business = resolveShowing(OPTIONS, { kind: 'business', venueId: 'v2' });
    expect(scopeNote(business, { scope: { kind: 'business', name: 'Light 3', business: light3 } })).toEqual({
      kind: 'scoped',
      lead: 'Showing Light 3.',
      detail: 'Bookings on the calendars Light 3 shares with you. Takings and sales are not shared between businesses.',
    });
    const together = resolveShowing(OPTIONS, { kind: 'together' });
    expect(
      scopeNote(together, { scope: { kind: 'together', name: 'Everyone together', business: null } }, { togetherNames: ['Plus 1', 'Light 3', 'Aura'] }),
    ).toEqual({
      kind: 'scoped',
      lead: 'Showing Everyone together: Plus 1, Light 3 and Aura.',
      detail: "Each business's figures are added up, and each one is listed below. A client who visits two businesses counts once at each.",
    });
  });

  it('never claims a scope the answer does not carry', () => {
    const business = resolveShowing(OPTIONS, { kind: 'business', venueId: 'v2' });
    expect(scopeNote(business, { scope: { kind: 'venue', name: 'Plus 1', business: null } })).toEqual({ kind: 'whole-venue' });
    expect(scopeNote(business, {})).toEqual({ kind: 'whole-venue' });
    expect(scopeNote(WHOLE_VENUE, { scope: { kind: 'venue', name: 'Plus 1', business: null } })).toBeNull();
    expect(scopeNote(WHOLE_VENUE, {})).toBeNull();
  });

  it('reads an older server, which echoes only the calendar', () => {
    const own = resolveShowing(OPTIONS, { kind: 'calendar', calendarId: 'c1' });
    expect(scopeNote(own, { calendar: { id: 'c1', name: 'Hannah' } })).toEqual({ kind: 'scoped', lead: 'Showing Hannah only.', detail: null });
  });

  it('says on a till tab that the figures are your venue only', () => {
    expect(tillScopeText(resolveShowing(OPTIONS, { kind: 'business', venueId: 'v2' }))).toBe(
      "These figures are your venue's only: takings and sales are never shared between businesses. Light 3 stays chosen on the other tabs.",
    );
    expect(tillScopeText(resolveShowing(OPTIONS, { kind: 'calendar', calendarId: 'c1' }))).toBeNull();
    expect(tillScopeText(WHOLE_VENUE)).toBeNull();
  });

  it('lists names as the web does', () => {
    expect(listNames([])).toBe('');
    expect(listNames(['A'])).toBe('A');
    expect(listNames(['A', 'B'])).toBe('A and B');
    expect(listNames(['A', 'B', 'C'])).toBe('A, B and C');
  });
});

describe('scopeRefusalMessage', () => {
  const refusal = (status: number, body: object) => new ApiError('x', status, body);

  it('is the server sentence for a business or calendar it refused', () => {
    const body = { error: "That business isn't one you can see reports for.", code: 'VALIDATION_FAILED', fields: [{ path: 'business', message: 'm' }] };
    expect(scopeRefusalMessage(refusal(400, body), true)).toBe("That business isn't one you can see reports for.");
    const cal = { error: 'Not yours.', code: 'VALIDATION_FAILED', fields: [{ path: 'calendar_id', message: 'm' }] };
    expect(scopeRefusalMessage(refusal(400, cal), true)).toBe('Not yours.');
  });

  it('is the 409 only while something is chosen, and nothing for any other failure', () => {
    const body = { error: 'Not ready yet.', code: 'CONFLICT' };
    expect(scopeRefusalMessage(refusal(409, body), true)).toBe('Not ready yet.');
    expect(scopeRefusalMessage(refusal(409, body), false)).toBeNull();
    expect(scopeRefusalMessage(refusal(400, { error: 'Bad dates', code: 'VALIDATION_FAILED', fields: [{ path: 'from' }] }), true)).toBeNull();
    expect(scopeRefusalMessage(new Error('boom'), true)).toBeNull();
  });
});
