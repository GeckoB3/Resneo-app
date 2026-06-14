import {
  addDaysToDateStr,
  addMonthsToDateStr,
  calendarDateInTimeZone,
  formatDayHeading,
  formatMonthLabel,
  formatRangeLabel,
  formatShortDayLabel,
  getCalendarWeekFromDate,
  getMonthRangeFromDate,
  getWeekRangeFromDate,
} from '@/lib/dates/venue-dates';

/**
 * These helpers parse "YYYY-MM-DD" as **noon UTC** and then render with date-fns
 * `format`, which uses the runner's *local* timezone. Noon UTC lands on the same
 * calendar day for every zone from UTC-12 through UTC+11 (London — UTC+0/+1 — is
 * always safe), so the label/`format`-based expectations below are stable on any
 * realistic dev/CI machine. The `calendarDateInTimeZone` tests, which exercise the
 * actual Europe/London Intl math, pin explicit UTC instants and are fully
 * timezone-independent.
 *
 * All inputs are fixed literals — nothing reads the current clock.
 *
 * DST reference for Europe/London (chosen years):
 *   - 2026 BST starts Sun 29 Mar (clocks 01:00 GMT -> 02:00 BST)
 *   - 2026 BST ends   Sun 25 Oct (clocks 02:00 BST -> 01:00 GMT)
 */

describe('addDaysToDateStr', () => {
  it('adds whole days within a month (happy path)', () => {
    expect(addDaysToDateStr('2026-05-23', 1)).toBe('2026-05-24');
    expect(addDaysToDateStr('2026-05-23', 6)).toBe('2026-05-29');
  });

  it('subtracts days with a negative offset', () => {
    expect(addDaysToDateStr('2026-05-23', -1)).toBe('2026-05-22');
    expect(addDaysToDateStr('2026-05-23', -23)).toBe('2026-04-30');
  });

  it('returns the same date for a zero offset', () => {
    expect(addDaysToDateStr('2026-05-23', 0)).toBe('2026-05-23');
  });

  it('rolls forward across a month boundary', () => {
    expect(addDaysToDateStr('2026-05-31', 1)).toBe('2026-06-01');
  });

  it('rolls backward across a year boundary', () => {
    expect(addDaysToDateStr('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles the leap day in a leap year (2024)', () => {
    expect(addDaysToDateStr('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysToDateStr('2024-02-29', 1)).toBe('2024-03-01');
  });

  it('skips a non-existent leap day in a common year (2026)', () => {
    expect(addDaysToDateStr('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('crosses the BST spring-forward boundary without dropping a day', () => {
    // 28 Mar (GMT) -> 29 Mar (clocks spring forward) -> 30 Mar (BST)
    expect(addDaysToDateStr('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDaysToDateStr('2026-03-28', 2)).toBe('2026-03-30');
  });

  it('crosses the BST autumn fall-back boundary without repeating a day', () => {
    // 24 Oct (BST) -> 25 Oct (clocks fall back) -> 26 Oct (GMT)
    expect(addDaysToDateStr('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDaysToDateStr('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('adds large multi-month offsets', () => {
    expect(addDaysToDateStr('2026-01-01', 365)).toBe('2027-01-01');
  });
});

describe('getWeekRangeFromDate', () => {
  it('returns a 7-day inclusive window from the given start date', () => {
    const range = getWeekRangeFromDate('2026-05-23');
    expect(range.from).toBe('2026-05-23');
    expect(range.to).toBe('2026-05-29');
    expect(range.days).toEqual([
      '2026-05-23',
      '2026-05-24',
      '2026-05-25',
      '2026-05-26',
      '2026-05-27',
      '2026-05-28',
      '2026-05-29',
    ]);
    expect(range.days).toHaveLength(7);
  });

  it('spans a month boundary correctly', () => {
    const range = getWeekRangeFromDate('2026-05-28');
    expect(range.from).toBe('2026-05-28');
    expect(range.to).toBe('2026-06-03');
    expect(range.days[3]).toBe('2026-05-31');
    expect(range.days[4]).toBe('2026-06-01');
  });

  it('spans a year boundary correctly', () => {
    const range = getWeekRangeFromDate('2025-12-29');
    expect(range.from).toBe('2025-12-29');
    expect(range.to).toBe('2026-01-04');
    expect(range.days).toContain('2025-12-31');
    expect(range.days).toContain('2026-01-01');
  });

  it('does not skip a day across the BST spring-forward weekend', () => {
    const range = getWeekRangeFromDate('2026-03-27');
    expect(range.days).toEqual([
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
    ]);
  });

  it('defaults the start to today in the venue timezone when omitted', () => {
    // Cannot pin the clock, but the contract is: from === today-in-tz and the
    // window is a contiguous, correctly-ordered 7-day span ending 6 days later.
    const range = getWeekRangeFromDate();
    expect(range.from).toBe(calendarDateInTimeZone(new Date(), 'Europe/London'));
    expect(range.days).toHaveLength(7);
    expect(range.days[0]).toBe(range.from);
    expect(range.to).toBe(range.days[6]);
    expect(range.to).toBe(addDaysToDateStr(range.from, 6));
  });

  it('uses a provided timezone for the default start date', () => {
    const range = getWeekRangeFromDate(undefined, 'Pacific/Kiritimati');
    expect(range.from).toBe(calendarDateInTimeZone(new Date(), 'Pacific/Kiritimati'));
    expect(range.days).toHaveLength(7);
  });
});

describe('getCalendarWeekFromDate', () => {
  it('returns the Monday-aligned week containing a mid-week date', () => {
    // 2026-05-20 is a Wednesday; its Monday is 2026-05-18.
    const range = getCalendarWeekFromDate('2026-05-20');
    expect(range.from).toBe('2026-05-18');
    expect(range.to).toBe('2026-05-24');
    expect(range.days).toEqual([
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
      '2026-05-23',
      '2026-05-24',
    ]);
  });

  it('keeps Monday itself as the week start', () => {
    // 2026-05-18 is a Monday.
    const range = getCalendarWeekFromDate('2026-05-18');
    expect(range.from).toBe('2026-05-18');
    expect(range.days[0]).toBe('2026-05-18');
  });

  it('treats Saturday as belonging to the week that started the prior Monday', () => {
    // 2026-05-23 is a Saturday -> Monday 2026-05-18.
    const range = getCalendarWeekFromDate('2026-05-23');
    expect(range.from).toBe('2026-05-18');
    expect(range.to).toBe('2026-05-24');
  });

  it('treats Sunday as the LAST day of the Monday-aligned week (weekStartsOn: 1)', () => {
    // 2026-05-24 is a Sunday -> Monday 2026-05-18, Sunday is days[6].
    const range = getCalendarWeekFromDate('2026-05-24');
    expect(range.from).toBe('2026-05-18');
    expect(range.to).toBe('2026-05-24');
    expect(range.days[6]).toBe('2026-05-24');
  });

  it('produces a week that straddles a month boundary', () => {
    // 2026-07-01 is a Wednesday; its Monday is 2026-06-29, so the strip runs
    // from late June into early July.
    const range = getCalendarWeekFromDate('2026-07-01');
    expect(range.from).toBe('2026-06-29');
    expect(range.to).toBe('2026-07-05');
    expect(range.days).toContain('2026-06-30');
    expect(range.days).toContain('2026-07-01');
  });

  it('produces a week that straddles a year boundary', () => {
    // 2026-01-01 is a Thursday -> Monday 2025-12-29.
    const range = getCalendarWeekFromDate('2026-01-01');
    expect(range.from).toBe('2025-12-29');
    expect(range.to).toBe('2026-01-04');
    expect(range.days).toContain('2025-12-31');
    expect(range.days).toContain('2026-01-01');
  });

  it('aligns correctly across the BST spring-forward week', () => {
    // 2026-03-29 (BST starts, a Sunday) -> Monday 2026-03-23.
    const range = getCalendarWeekFromDate('2026-03-29');
    expect(range.from).toBe('2026-03-23');
    expect(range.to).toBe('2026-03-29');
    expect(range.days).toHaveLength(7);
  });
});

describe('formatShortDayLabel', () => {
  it('formats a compact "EEE d" chip label (happy path)', () => {
    expect(formatShortDayLabel('2026-05-23')).toBe('Sat 23');
  });

  it('omits a leading zero on the day number', () => {
    expect(formatShortDayLabel('2026-05-01')).toBe('Fri 1');
    expect(formatShortDayLabel('2026-05-09')).toBe('Sat 9');
  });

  it('is correct inside British Summer Time', () => {
    // 2026-06-15 is a Monday (BST).
    expect(formatShortDayLabel('2026-06-15')).toBe('Mon 15');
  });

  it('is correct inside GMT (winter)', () => {
    // 2026-01-15 is a Thursday (GMT).
    expect(formatShortDayLabel('2026-01-15')).toBe('Thu 15');
  });

  it('is correct on the BST spring-forward day', () => {
    // 2026-03-29 is a Sunday.
    expect(formatShortDayLabel('2026-03-29')).toBe('Sun 29');
  });
});

describe('formatDayHeading', () => {
  it('formats a full "EEEE d MMMM" heading (happy path)', () => {
    expect(formatDayHeading('2026-05-23')).toBe('Saturday 23 May');
  });

  it('is correct inside British Summer Time', () => {
    expect(formatDayHeading('2026-06-15')).toBe('Monday 15 June');
  });

  it('is correct inside GMT (winter)', () => {
    expect(formatDayHeading('2025-12-25')).toBe('Thursday 25 December');
  });

  it('renders the leap day heading in a leap year', () => {
    // 2024-02-29 is a Thursday.
    expect(formatDayHeading('2024-02-29')).toBe('Thursday 29 February');
  });

  it('renders the first of the month without a leading zero', () => {
    expect(formatDayHeading('2026-11-01')).toBe('Sunday 1 November');
  });
});

describe('addMonthsToDateStr', () => {
  it('adds whole months (happy path)', () => {
    expect(addMonthsToDateStr('2026-05-15', 1)).toBe('2026-06-15');
    expect(addMonthsToDateStr('2026-05-15', 3)).toBe('2026-08-15');
  });

  it('subtracts whole months with a negative offset', () => {
    expect(addMonthsToDateStr('2026-05-15', -1)).toBe('2026-04-15');
  });

  it('rolls forward across a year boundary', () => {
    expect(addMonthsToDateStr('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('rolls backward across a year boundary', () => {
    expect(addMonthsToDateStr('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('clamps to the last day when the target month is shorter (Jan 31 -> Feb)', () => {
    // 2026 is a common year: Feb has 28 days.
    expect(addMonthsToDateStr('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('clamps Jan 31 to Feb 29 in a leap year', () => {
    expect(addMonthsToDateStr('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('returns the same date for a zero offset', () => {
    expect(addMonthsToDateStr('2026-05-15', 0)).toBe('2026-05-15');
  });
});

describe('getMonthRangeFromDate', () => {
  it('returns the first and last day of the month (happy path)', () => {
    expect(getMonthRangeFromDate('2026-05-15')).toEqual({
      from: '2026-05-01',
      to: '2026-05-31',
    });
  });

  it('handles a 30-day month', () => {
    expect(getMonthRangeFromDate('2026-04-10')).toEqual({
      from: '2026-04-01',
      to: '2026-04-30',
    });
  });

  it('handles February in a common year (28 days)', () => {
    expect(getMonthRangeFromDate('2026-02-14')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('handles February in a leap year (29 days)', () => {
    expect(getMonthRangeFromDate('2024-02-10')).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });
  });

  it('is stable when the input is already the first day of the month', () => {
    expect(getMonthRangeFromDate('2026-05-01')).toEqual({
      from: '2026-05-01',
      to: '2026-05-31',
    });
  });

  it('is stable when the input is already the last day of the month', () => {
    expect(getMonthRangeFromDate('2026-05-31')).toEqual({
      from: '2026-05-01',
      to: '2026-05-31',
    });
  });

  it('handles December (year boundary)', () => {
    expect(getMonthRangeFromDate('2026-12-25')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });
});

describe('formatMonthLabel', () => {
  it('formats a "MMMM yyyy" label (happy path)', () => {
    expect(formatMonthLabel('2026-05-15')).toBe('May 2026');
  });

  it('is correct inside British Summer Time', () => {
    expect(formatMonthLabel('2026-06-15')).toBe('June 2026');
  });

  it('is correct inside GMT (winter)', () => {
    expect(formatMonthLabel('2026-01-15')).toBe('January 2026');
  });

  it('ignores the day-of-month component', () => {
    expect(formatMonthLabel('2026-12-01')).toBe('December 2026');
    expect(formatMonthLabel('2026-12-31')).toBe('December 2026');
  });
});

describe('formatRangeLabel', () => {
  it('formats a compact "d MMM – d MMM" range (happy path)', () => {
    const label = formatRangeLabel('2026-05-23', '2026-05-29');
    // Assert on stable substrings; the separator is an en-dash (U+2013).
    expect(label).toContain('23 May');
    expect(label).toContain('29 May');
    expect(label).toBe('23 May – 29 May');
  });

  it('formats a range spanning two months', () => {
    const label = formatRangeLabel('2026-05-28', '2026-06-03');
    expect(label).toContain('28 May');
    expect(label).toContain('3 Jun');
    expect(label).toBe('28 May – 3 Jun');
  });

  it('formats a range spanning a year boundary', () => {
    const label = formatRangeLabel('2025-12-29', '2026-01-04');
    expect(label).toContain('29 Dec');
    expect(label).toContain('4 Jan');
  });

  it('drops leading zeros on day numbers', () => {
    const label = formatRangeLabel('2026-05-01', '2026-05-07');
    expect(label).toContain('1 May');
    expect(label).toContain('7 May');
  });

  it('handles an identical from/to (single day)', () => {
    expect(formatRangeLabel('2026-05-23', '2026-05-23')).toBe('23 May – 23 May');
  });
});

describe('calendarDateInTimeZone', () => {
  it('returns YYYY-MM-DD for an explicit instant (happy path)', () => {
    expect(calendarDateInTimeZone(new Date('2026-05-23T12:00:00Z'))).toBe('2026-05-23');
  });

  it('defaults to Europe/London when no timezone is given', () => {
    // 23:30 UTC on 15 Jun is 00:30 BST on 16 Jun -> the London calendar date rolls over.
    expect(calendarDateInTimeZone(new Date('2026-06-15T23:30:00Z'))).toBe('2026-06-16');
  });

  it('applies BST (+1) for a summer instant near midnight', () => {
    // During BST, 23:30 UTC is already the next London day.
    expect(calendarDateInTimeZone(new Date('2026-06-15T23:30:00Z'), 'Europe/London')).toBe(
      '2026-06-16',
    );
    // ...but 22:30 UTC (23:30 BST) is still the same London day.
    expect(calendarDateInTimeZone(new Date('2026-06-15T22:30:00Z'), 'Europe/London')).toBe(
      '2026-06-15',
    );
  });

  it('applies GMT (+0) for a winter instant (no offset)', () => {
    // In GMT, the London calendar date equals the UTC date.
    expect(calendarDateInTimeZone(new Date('2026-01-15T23:30:00Z'), 'Europe/London')).toBe(
      '2026-01-15',
    );
    expect(calendarDateInTimeZone(new Date('2026-01-15T00:30:00Z'), 'Europe/London')).toBe(
      '2026-01-15',
    );
  });

  it('rolls the calendar date back for a pre-BST early-morning instant', () => {
    // 00:30 UTC on 15 Jun = 01:30 BST on 15 Jun -> still 15 Jun (sanity on the +1 direction).
    expect(calendarDateInTimeZone(new Date('2026-06-15T00:30:00Z'), 'Europe/London')).toBe(
      '2026-06-15',
    );
  });

  it('handles the exact BST spring-forward instant (01:00 GMT -> 02:00 BST)', () => {
    // The transition happens at 01:00 UTC on 2026-03-29; the date is unaffected.
    expect(calendarDateInTimeZone(new Date('2026-03-29T01:00:00Z'), 'Europe/London')).toBe(
      '2026-03-29',
    );
  });

  it('honours a non-London timezone (UTC+14 rolls forward)', () => {
    // Kiritimati is UTC+14: noon UTC on 31 Dec is already 02:00 on 1 Jan there.
    expect(calendarDateInTimeZone(new Date('2026-12-31T12:00:00Z'), 'Pacific/Kiritimati')).toBe(
      '2027-01-01',
    );
  });

  it('honours a non-London timezone (UTC-10 rolls back)', () => {
    // Honolulu is UTC-10: 05:00 UTC on 1 Jan is 19:00 on 31 Dec there.
    expect(calendarDateInTimeZone(new Date('2026-01-01T05:00:00Z'), 'Pacific/Honolulu')).toBe(
      '2025-12-31',
    );
  });

  it('throws on an unparseable Date (Node ICU rejects an invalid time value)', () => {
    // This Node's Intl.DateTimeFormat.format() throws RangeError for an invalid
    // Date. (Some older engines instead return the literal "Invalid Date"; we pin
    // the behavior of the engine the suite runs under.)
    expect(() => calendarDateInTimeZone(new Date('not-a-real-date'))).toThrow(RangeError);
  });
});

/**
 * Malformed / empty input.
 *
 * These helpers do NOT validate their input: an unparseable date string yields a
 * date-fns "Invalid Date", and the subsequent `format(...)` / arithmetic call
 * throws `RangeError: Invalid time value`. date-fns v4 is strict — out-of-range
 * components (e.g. "2026-02-30", "2026-13-40") are treated as invalid rather than
 * rolled over. We assert the CURRENT throwing behavior so the contract is pinned.
 *
 * In practice every caller passes a well-formed YYYY-MM-DD produced by the
 * calendar itself, so this is defensive documentation rather than a reachable
 * path. See the suspected-bug note in the task report about the absence of guards.
 */
describe('malformed and empty input', () => {
  it('addDaysToDateStr throws on empty / garbage / out-of-range dates', () => {
    expect(() => addDaysToDateStr('', 1)).toThrow(RangeError);
    expect(() => addDaysToDateStr('nonsense', 1)).toThrow('Invalid time value');
    expect(() => addDaysToDateStr('2026-13-40', 1)).toThrow(RangeError);
    // date-fns v4 does NOT roll Feb 30 over to Mar 2 — it is simply invalid.
    expect(() => addDaysToDateStr('2026-02-30', 1)).toThrow(RangeError);
  });

  it('addDaysToDateStr throws on a NaN day offset', () => {
    expect(() => addDaysToDateStr('2026-05-23', Number.NaN)).toThrow(RangeError);
  });

  it('addMonthsToDateStr throws on empty / garbage dates and NaN offsets', () => {
    expect(() => addMonthsToDateStr('', 1)).toThrow(RangeError);
    expect(() => addMonthsToDateStr('not-a-date', 1)).toThrow('Invalid time value');
    expect(() => addMonthsToDateStr('2026-05-23', Number.NaN)).toThrow(RangeError);
  });

  it('formatShortDayLabel throws on empty / garbage dates', () => {
    expect(() => formatShortDayLabel('')).toThrow(RangeError);
    expect(() => formatShortDayLabel('nope')).toThrow('Invalid time value');
  });

  it('formatDayHeading throws on empty / garbage dates', () => {
    expect(() => formatDayHeading('')).toThrow(RangeError);
    expect(() => formatDayHeading('2026-99-99')).toThrow(RangeError);
  });

  it('formatMonthLabel throws on empty / garbage dates', () => {
    expect(() => formatMonthLabel('')).toThrow(RangeError);
    expect(() => formatMonthLabel('garbage')).toThrow('Invalid time value');
  });

  it('formatRangeLabel throws when either endpoint is unparseable', () => {
    expect(() => formatRangeLabel('', '2026-05-29')).toThrow(RangeError);
    expect(() => formatRangeLabel('2026-05-23', '')).toThrow(RangeError);
    expect(() => formatRangeLabel('bad', 'worse')).toThrow('Invalid time value');
  });

  it('getMonthRangeFromDate throws on empty / garbage dates', () => {
    expect(() => getMonthRangeFromDate('')).toThrow(RangeError);
    expect(() => getMonthRangeFromDate('2026-00-10')).toThrow(RangeError);
  });

  it('getWeekRangeFromDate throws when an explicit empty start date is given', () => {
    // An empty string is NOT the same as omitting the argument: it is used as the
    // window start and fails when the first day offset is formatted.
    expect(() => getWeekRangeFromDate('')).toThrow(RangeError);
    expect(() => getWeekRangeFromDate('not-a-date')).toThrow('Invalid time value');
  });

  it('getCalendarWeekFromDate throws on empty / garbage dates', () => {
    expect(() => getCalendarWeekFromDate('')).toThrow(RangeError);
    expect(() => getCalendarWeekFromDate('2026-13-01')).toThrow(RangeError);
  });
});
