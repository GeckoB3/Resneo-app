/**
 * The Reports calendar filter's rules (the contract shared with the web, 2026-10-12): the param,
 * the list, what a section says about the figures on screen, and which refusals are the filter's.
 */
import { ApiError } from '@/lib/api/client';
import {
  calendarRefusalMessage,
  calendarRetryOption,
  calendarScope,
  calendarFileTag,
  calendarScopeText,
  parseReportCalendars,
  REPORT_CALENDAR_COPY,
  reportCalendarLabel,
  retryReport,
  showReportCalendarPicker,
  withCalendarCsvLine,
  withCalendarParam,
} from '@/lib/reports/report-calendar';

describe('withCalendarParam', () => {
  it('adds calendar_id for one calendar and leaves the whole venue as it was', () => {
    expect(withCalendarParam('grain=day&preset=this-week', 'cal-1')).toBe('grain=day&preset=this-week&calendar_id=cal-1');
    expect(withCalendarParam('grain=day&preset=this-week', null)).toBe('grain=day&preset=this-week');
    expect(withCalendarParam('grain=day', undefined)).toBe('grain=day');
    expect(withCalendarParam('', 'cal-1')).toBe('calendar_id=cal-1');
  });

  it('encodes the id', () => {
    expect(withCalendarParam('from=2026-10-01', 'a b&c')).toBe('from=2026-10-01&calendar_id=a%20b%26c');
  });
});

describe('a calendar in a file', () => {
  it("tags the file name with the calendar's name, as the web's calendarFileTag", () => {
    expect(calendarFileTag({ name: 'Jess' })).toBe('-jess');
    expect(calendarFileTag({ name: '  Room 2 / Upstairs ' })).toBe('-room-2-upstairs');
    expect(calendarFileTag({ name: '***' })).toBe('-calendar');
    expect(calendarFileTag(null)).toBe('');
  });

  it("starts one calendar's CSV with Showing {calendar} only and a blank line", () => {
    const rows = [['Period', 'Total']];
    expect(withCalendarCsvLine(rows, { name: 'Jess' })).toEqual([['Showing Jess only'], [], ['Period', 'Total']]);
    expect(withCalendarCsvLine(rows, null)).toBe(rows);
  });
});

describe('parseReportCalendars', () => {
  it("keeps the server's order and reads active, defaulting to active", () => {
    expect(
      parseReportCalendars({
        calendars: [
          { id: 'c2', name: 'Zara', active: true },
          { id: 'c1', name: 'Amy' },
          { id: 'c3', name: 'Old room', active: false },
        ],
      }),
    ).toEqual([
      { id: 'c2', name: 'Zara', active: true },
      { id: 'c1', name: 'Amy', active: true },
      { id: 'c3', name: 'Old room', active: false },
    ]);
  });

  it('leaves out what it cannot read, and repeats', () => {
    expect(
      parseReportCalendars({ calendars: [null, { name: 'No id' }, { id: 'c1', name: '  ' }, { id: 'c1', name: 'Again' }, 'x'] }),
    ).toEqual([{ id: 'c1', name: 'Calendar', active: true }]);
    expect(parseReportCalendars(null)).toEqual([]);
    expect(parseReportCalendars({ calendars: 'nope' })).toEqual([]);
  });
});

describe('the picker', () => {
  it('labels a calendar no longer active', () => {
    expect(reportCalendarLabel({ name: 'Hannah', active: true })).toBe('Hannah');
    expect(reportCalendarLabel({ name: 'Jo', active: false })).toBe('Jo (no longer active)');
  });

  it('shows once there are two calendars, or one is already chosen', () => {
    const one = [{ id: 'c1', name: 'Hannah', active: true }];
    const two = [...one, { id: 'c2', name: 'Jenny', active: true }];
    expect(showReportCalendarPicker([], null)).toBe(false);
    expect(showReportCalendarPicker(one, null)).toBe(false);
    expect(showReportCalendarPicker(one, 'c1')).toBe(true);
    expect(showReportCalendarPicker(one, 'gone')).toBe(false);
    expect(showReportCalendarPicker(two, null)).toBe(true);
  });
});

describe('what a section says about its figures', () => {
  const hannah = { id: 'c1', name: 'Hannah' };

  it('names the calendar the answer echoes', () => {
    const scope = calendarScope(hannah, hannah);
    expect(scope).toEqual({ kind: 'calendar', name: 'Hannah' });
    expect(calendarScopeText(scope)).toBe('Showing Hannah only.');
  });

  it('reads an answer without a calendar as the whole venue while one is chosen', () => {
    expect(calendarScopeText(calendarScope(hannah, undefined))).toBe('These figures are for the whole venue.');
    expect(calendarScopeText(calendarScope(hannah, null))).toBe('These figures are for the whole venue.');
  });

  it('says nothing for the whole venue with all calendars chosen, as before the filter', () => {
    expect(calendarScope(null, null)).toBeNull();
    expect(calendarScope(null, undefined)).toBeNull();
    expect(calendarScopeText(null)).toBeNull();
  });

  it('describes the figures on screen: a kept answer for another calendar names that one', () => {
    expect(calendarScopeText(calendarScope(null, hannah))).toBe('Showing Hannah only.');
  });
});

describe('calendarRefusalMessage', () => {
  const notReady = "Filtering by calendar isn't ready yet for this report.";

  it("returns the server's sentence for a 409 while a calendar is chosen", () => {
    const error = new ApiError(notReady, 409, { error: notReady, code: 'CONFLICT' });
    expect(calendarRefusalMessage(error, true)).toBe(notReady);
    // Without a calendar a 409 is something else, and keeps the usual error.
    expect(calendarRefusalMessage(error, false)).toBeNull();
  });

  it("returns the server's sentence for a 400 on calendar_id", () => {
    const error = new ApiError("That isn't a calendar. Choose one from the list, or All calendars.", 400, {
      error: "That isn't a calendar. Choose one from the list, or All calendars.",
      code: 'VALIDATION_FAILED',
      fields: [{ path: 'calendar_id', message: "That isn't a calendar. Choose one from the list, or All calendars." }],
    });
    expect(calendarRefusalMessage(error, true)).toBe("That isn't a calendar. Choose one from the list, or All calendars.");
  });

  it('leaves every other failure to the usual error', () => {
    const range = new ApiError('Choose a range of up to 400 days.', 400, {
      error: 'Choose a range of up to 400 days.',
      code: 'VALIDATION_FAILED',
      fields: [{ path: 'to', message: 'Choose a range of up to 400 days.' }],
    });
    expect(calendarRefusalMessage(range, true)).toBeNull();
    expect(calendarRefusalMessage(new ApiError('Boom', 500, { error: 'Boom' }), true)).toBeNull();
    expect(calendarRefusalMessage(new ApiError('Other', 409, { error: 'Other', code: 'POS_SALE_STALE' }), true)).toBeNull();
    expect(calendarRefusalMessage(new Error('offline'), true)).toBeNull();
    expect(calendarRefusalMessage(null, true)).toBeNull();
  });
});

describe('retryReport', () => {
  it('shows a refusal at once and tries anything else once more', () => {
    expect(retryReport(0, new ApiError('x', 409, { error: 'x' }))).toBe(false);
    expect(retryReport(0, new ApiError('x', 400, { error: 'x' }))).toBe(false);
    expect(retryReport(0, new ApiError('x', 500, { error: 'x' }))).toBe(true);
    expect(retryReport(1, new ApiError('x', 500, { error: 'x' }))).toBe(false);
    expect(retryReport(0, new Error('timeout'))).toBe(true);
  });

  it('applies only while a calendar is chosen, leaving the whole venue on the app default', () => {
    expect(calendarRetryOption('cal-1')).toEqual({ retry: retryReport });
    // No `retry` key at all: an explicit undefined would replace the app's default with three retries.
    expect(calendarRetryOption(null)).toEqual({});
    expect('retry' in calendarRetryOption(undefined)).toBe(false);
  });
});

describe('the words', () => {
  const entries = Object.entries(REPORT_CALENDAR_COPY);

  it('follow the house rules: no em-dash, straight apostrophes, no single country', () => {
    const EM_DASH = String.fromCharCode(0x2014);
    const curly = [0x2018, 0x2019, 0x201c, 0x201d].map((c) => String.fromCharCode(c));
    expect(entries.filter(([, t]) => t.includes(EM_DASH)).map(([id]) => id)).toEqual([]);
    expect(entries.filter(([, t]) => curly.some((c) => t.includes(c))).map(([id]) => id)).toEqual([]);
    expect(entries.filter(([, t]) => /northern ireland|great britain|\bengland\b|\bscotland\b|\bwales\b/i.test(t)).map(([id]) => id)).toEqual([]);
  });

  it('use the contract words', () => {
    expect(REPORT_CALENDAR_COPY['cal.all']).toBe('All calendars');
    expect(REPORT_CALENDAR_COPY['cal.wholeVenue']).toBe('These figures are for the whole venue.');
  });
});
