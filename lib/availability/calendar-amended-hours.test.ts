import {
  amendedHoursLeaveNote,
  amendedHoursOnDate,
  amendedHoursVenueNote,
  describeHoursPeriods,
  enumerateDatesInclusive,
  firstFullDayLeaveDate,
  normaliseHoursPeriods,
} from '@/lib/availability/calendar-amended-hours';

const OPEN_MON_TO_FRI = {
  '1': { periods: [{ open: '09:00', close: '17:00' }] },
  '2': { periods: [{ open: '09:00', close: '17:00' }] },
  '3': { periods: [{ open: '09:00', close: '17:00' }] },
  '4': { periods: [{ open: '09:00', close: '17:00' }] },
  '5': { periods: [{ open: '09:00', close: '17:00' }] },
  '0': { closed: true },
  '6': { closed: true },
} as never;

describe('enumerateDatesInclusive', () => {
  it('lists every date, month boundary included', () => {
    expect(enumerateDatesInclusive('2026-09-29', '2026-10-02')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });
});

describe('normaliseHoursPeriods', () => {
  it('sorts and merges touching periods', () => {
    expect(
      normaliseHoursPeriods([
        { start: '13:00', end: '17:00' },
        { start: '09:00', end: '13:00' },
      ]),
    ).toEqual({ ok: true, periods: [{ start: '09:00', end: '17:00' }] });
  });

  it('refuses an empty list, a bad time and a close before open, in the web’s words', () => {
    expect(normaliseHoursPeriods([])).toEqual({ ok: false, error: 'Enter at least one open and close time.' });
    expect(normaliseHoursPeriods([{ start: '9am', end: '17:00' }])).toEqual({
      ok: false,
      error: 'Times must be in HH:mm form.',
    });
    expect(normaliseHoursPeriods([{ start: '17:00', end: '09:00' }])).toEqual({
      ok: false,
      error: 'Close time must be after open time (17:00 to 09:00).',
    });
  });
});

describe('firstFullDayLeaveDate and the leave note', () => {
  const leave = [
    { start_date: '2026-09-22', end_date: '2026-09-22', unavailable_start_time: '14:00', unavailable_end_time: '15:00' },
    { start_date: '2026-09-24', end_date: '2026-09-25', unavailable_start_time: null, unavailable_end_time: null },
  ];

  it('finds the first full-day leave in the range', () => {
    expect(firstFullDayLeaveDate('2026-09-21', '2026-09-27', leave)).toBe('2026-09-24');
    expect(firstFullDayLeaveDate('2026-09-21', '2026-09-23', leave)).toBeNull();
  });

  it('blocks on full-day leave and names part-day leave', () => {
    expect(
      amendedHoursLeaveNote({ dateStart: '2026-09-21', dateEnd: '2026-09-27', leave, calendarName: 'Sarah' }),
    ).toEqual({ blocking: true, text: expect.stringContaining('Sarah is closed all day on') });
    expect(
      amendedHoursLeaveNote({ dateStart: '2026-09-21', dateEnd: '2026-09-23', leave, calendarName: 'Sarah' }),
    ).toEqual({
      blocking: false,
      text: expect.stringContaining('Sarah is unavailable 14:00 to 15:00 on'),
    });
    expect(
      amendedHoursLeaveNote({ dateStart: '2026-09-28', dateEnd: '2026-09-28', leave, calendarName: 'Sarah' }),
    ).toBeNull();
  });
});

describe('amendedHoursVenueNote', () => {
  it('says nothing when the hours sit inside the venue’s', () => {
    expect(
      amendedHoursVenueNote({
        dateStart: '2026-09-22',
        dateEnd: '2026-09-22',
        periods: [{ start: '10:00', end: '14:00' }],
        venueHours: OPEN_MON_TO_FRI,
        venueBlocks: [],
      }),
    ).toBeNull();
  });

  it('names a closed venue day and hours past the venue’s close', () => {
    expect(
      amendedHoursVenueNote({
        dateStart: '2026-09-27',
        dateEnd: '2026-09-27',
        periods: [{ start: '10:00', end: '14:00' }],
        venueHours: OPEN_MON_TO_FRI,
        venueBlocks: [],
      }),
    ).toContain('Your venue is closed on');
    expect(
      amendedHoursVenueNote({
        dateStart: '2026-09-22',
        dateEnd: '2026-09-22',
        periods: [{ start: '10:00', end: '19:00' }],
        venueHours: OPEN_MON_TO_FRI,
        venueBlocks: [],
      }),
    ).toContain('Hours outside 09:00 to 17:00 on');
  });
});

describe('amendedHoursOnDate and describeHoursPeriods', () => {
  it('finds the entry covering a date, per calendar', () => {
    const entries = [
      {
        kind: 'hours' as const,
        date_start: '2026-09-21',
        date_end: '2026-09-23',
        periods: [{ start: '10:00', end: '14:00' }],
        reason: null,
        calendar_id: 'cal-1',
        calendar_name: 'Sarah',
      },
    ];
    expect(amendedHoursOnDate(entries, '2026-09-22', 'cal-1')?.calendar_name).toBe('Sarah');
    expect(amendedHoursOnDate(entries, '2026-09-22', 'cal-2')).toBeNull();
    expect(amendedHoursOnDate(entries, '2026-09-24')).toBeNull();
    expect(describeHoursPeriods(entries[0]!.periods)).toBe('10:00–14:00');
  });
});
