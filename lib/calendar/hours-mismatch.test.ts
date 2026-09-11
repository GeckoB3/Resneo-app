import {
  datedCalendarHoursOutsideVenue,
  describeCalendarWeeklyMismatch,
  describeDatedMismatch,
  describeVenueWeeklyMismatch,
  weeklyCalendarHoursOutsideVenue,
} from '@/lib/calendar/hours-mismatch';

/**
 * A calendar set to work past closing produces hours that exist but never
 * sell, and nothing said so (web 2026-09-10). These sentences are what each
 * save now says, and the rules for when it says nothing.
 */

const VENUE_NINE_TO_FIVE = { '1': { periods: [{ open: '09:00', close: '17:00' }] } };

describe('weeklyCalendarHoursOutsideVenue', () => {
  it('names the weekday a calendar runs past the venue', () => {
    const out = weeklyCalendarHoursOutsideVenue(
      { '1': [{ start: '08:00', end: '20:00' }] },
      VENUE_NINE_TO_FIVE,
    );
    expect(out).toEqual([
      { dayKey: '1', dayName: 'Monday', calendarHours: '08:00 to 20:00', venueHours: '09:00 to 17:00' },
    ]);
  });

  it('reads the legacy weekday-name keys too', () => {
    expect(
      weeklyCalendarHoursOutsideVenue({ mon: [{ start: '08:00', end: '12:00' }] }, VENUE_NINE_TO_FIVE),
    ).toHaveLength(1);
  });

  it('says nothing when the calendar fits, or the venue has no hours at all', () => {
    const fits = { '1': [{ start: '10:00', end: '16:00' }] };
    expect(weeklyCalendarHoursOutsideVenue(fits, VENUE_NINE_TO_FIVE)).toEqual([]);
    expect(weeklyCalendarHoursOutsideVenue({ '1': [{ start: '00:00', end: '23:59' }] }, null)).toEqual([]);
  });

  it('flags a weekday the venue is closed', () => {
    const out = weeklyCalendarHoursOutsideVenue(
      { '0': [{ start: '10:00', end: '14:00' }] },
      { '0': { closed: true } },
    );
    expect(out[0]).toMatchObject({ dayName: 'Sunday', venueHours: 'Venue closed' });
  });
});

describe('describeCalendarWeeklyMismatch', () => {
  it('is null with nothing to say', () => {
    expect(describeCalendarWeeklyMismatch('Hannah', [])).toBeNull();
  });

  it('lists the days and points at business hours', () => {
    const text = describeCalendarWeeklyMismatch('Hannah', [
      { dayKey: '1', dayName: 'Monday', calendarHours: '08:00 to 20:00', venueHours: '09:00 to 17:00' },
      { dayKey: '2', dayName: 'Tuesday', calendarHours: '08:00 to 20:00', venueHours: '09:00 to 17:00' },
    ]);
    expect(text).toContain("Hannah's hours on Monday and Tuesday run outside your business hours");
    expect(text).toContain('widen your business hours for those days too');
  });
});

describe('describeVenueWeeklyMismatch', () => {
  it('names the calendars the new hours leave outside, skipping inactive and resource columns', () => {
    const text = describeVenueWeeklyMismatch(
      [
        { id: 'a', name: 'Hannah', working_hours: { '1': [{ start: '08:00', end: '20:00' }] } },
        { id: 'b', name: 'Paused', is_active: false, working_hours: { '1': [{ start: '08:00', end: '20:00' }] } },
        { id: 'c', name: 'Room 1', calendar_type: 'resource', working_hours: { '1': [{ start: '08:00', end: '20:00' }] } },
        { id: 'd', name: 'Fits', working_hours: { '1': [{ start: '10:00', end: '16:00' }] } },
      ],
      VENUE_NINE_TO_FIVE,
    );
    expect(text).toContain('narrower than the calendar hours of Hannah (Monday 08:00 to 20:00)');
    expect(text).not.toContain('Paused');
    expect(text).not.toContain('Room 1');
    expect(text).not.toContain('Fits');
  });
});

describe('datedCalendarHoursOutsideVenue', () => {
  // 2026-08-24 is a Monday.
  const roster = [{ id: 'a', name: 'Hannah', working_hours: { '1': [{ start: '09:00', end: '17:00' }] } }];

  it('flags a calendar still working on a day the venue closed', () => {
    const out = datedCalendarHoursOutsideVenue(
      roster,
      VENUE_NINE_TO_FIVE,
      [{ id: 'x', date_start: '2026-08-24', date_end: '2026-08-24', block_type: 'closed' }],
      '2026-08-24',
      '2026-08-24',
    );
    expect(out).toEqual([
      { calendarName: 'Hannah', date: '2026-08-24', calendarHours: '09:00 to 17:00', venueHours: 'closed' },
    ]);
    expect(describeDatedMismatch(out)).toContain('Hannah is still scheduled to work outside these hours');
    expect(describeDatedMismatch(out)).toContain('the venue is closed on Mon 24 Aug');
  });

  it('flags a calendar running past amended hours, and nothing when it fits', () => {
    const amended = [
      {
        id: 'y',
        date_start: '2026-08-24',
        date_end: '2026-08-24',
        block_type: 'amended_hours',
        override_periods: [{ open: '10:00', close: '14:00' }],
      },
    ];
    const out = datedCalendarHoursOutsideVenue(roster, VENUE_NINE_TO_FIVE, amended, '2026-08-24', '2026-08-24');
    expect(out[0]).toMatchObject({ venueHours: '10:00 to 14:00' });

    const wide = [{ ...amended[0]!, override_periods: [{ open: '08:00', close: '20:00' }] }];
    expect(datedCalendarHoursOutsideVenue(roster, VENUE_NINE_TO_FIVE, wide, '2026-08-24', '2026-08-24')).toEqual([]);
  });

  it('is silent when the venue has no hours (no constraint)', () => {
    expect(datedCalendarHoursOutsideVenue(roster, null, [], '2026-08-24', '2026-08-24')).toEqual([]);
  });
});
