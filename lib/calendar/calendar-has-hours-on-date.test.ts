import {
  calendarHasAvailableHoursOnDate,
  calendarWorksOnDate,
} from '@/lib/calendar/calendar-has-hours-on-date';

/** 2026-09-07 is a Monday; 2026-09-08 a Tuesday. */
const MONDAY = '2026-09-07';
const TUESDAY = '2026-09-08';
const row = { working_hours: { '1': [{ start: '09:00', end: '17:00' }] } };

describe('calendarWorksOnDate (template only, for a linked column)', () => {
  it('answers from the weekly shape, minus a day off', () => {
    expect(calendarWorksOnDate(row, MONDAY)).toBe(true);
    expect(calendarWorksOnDate(row, TUESDAY)).toBe(false);
    expect(calendarWorksOnDate({ ...row, days_off: [MONDAY] }, MONDAY)).toBe(false);
    expect(calendarWorksOnDate({}, MONDAY)).toBe(false);
  });

  it('reads a per-date override the way the diary does', () => {
    expect(
      calendarWorksOnDate({ ...row, availability_exceptions: { [MONDAY]: { closed: true } } }, MONDAY),
    ).toBe(false);
    expect(
      calendarWorksOnDate(
        { ...row, availability_exceptions: { [TUESDAY]: { periods: [{ start: '10:00', end: '12:00' }] } } },
        TUESDAY,
      ),
    ).toBe(true);
  });
});

describe('calendarHasAvailableHoursOnDate (an own column)', () => {
  const base = {
    calendarId: 'cal-1',
    row,
    dateYmd: MONDAY,
    leavePeriods: [],
    openingHours: null,
    venueWideBlocks: [],
  };

  it('is true with hours and nothing taking them away', () => {
    expect(calendarHasAvailableHoursOnDate(base)).toBe(true);
    expect(calendarHasAvailableHoursOnDate({ ...base, dateYmd: TUESDAY })).toBe(false);
  });

  it('is false on a full day of leave, or when partial leave swallows every working minute', () => {
    const fullDay = { practitioner_id: 'cal-1', start_date: MONDAY, end_date: MONDAY };
    expect(calendarHasAvailableHoursOnDate({ ...base, leavePeriods: [fullDay] })).toBe(false);

    const wholeShift = {
      ...fullDay,
      unavailable_start_time: '09:00',
      unavailable_end_time: '17:00',
    };
    expect(calendarHasAvailableHoursOnDate({ ...base, leavePeriods: [wholeShift] })).toBe(false);

    const morning = { ...fullDay, unavailable_start_time: '09:00', unavailable_end_time: '12:00' };
    expect(calendarHasAvailableHoursOnDate({ ...base, leavePeriods: [morning] })).toBe(true);

    // Someone else's leave is not this column's.
    expect(
      calendarHasAvailableHoursOnDate({ ...base, leavePeriods: [{ ...fullDay, practitioner_id: 'cal-2' }] }),
    ).toBe(true);
  });

  it('follows the venue: closed that weekday is false, an overlapping window is true, a disjoint one false', () => {
    expect(calendarHasAvailableHoursOnDate({ ...base, openingHours: { '1': { closed: true } } })).toBe(false);
    expect(
      calendarHasAvailableHoursOnDate({
        ...base,
        openingHours: { '1': { periods: [{ open: '10:00', close: '12:00' }] } },
      }),
    ).toBe(true);
    expect(
      calendarHasAvailableHoursOnDate({
        ...base,
        openingHours: { '1': { periods: [{ open: '18:00', close: '20:00' }] } },
      }),
    ).toBe(false);
  });

  it('is false on a venue-wide closure for the day', () => {
    expect(
      calendarHasAvailableHoursOnDate({
        ...base,
        venueWideBlocks: [{ id: 'b1', block_type: 'closed', date_start: MONDAY, date_end: MONDAY }],
      }),
    ).toBe(false);
  });
});
