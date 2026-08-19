import {
  calendarHoursOutsideVenue,
  describeVenueDay,
  venueDayContext,
} from '@/lib/calendar/venue-hours-context';
import type { OpeningHours } from '@/types/venue';

describe('venueDayContext', () => {
  it('reports unset when there are no opening hours at all', () => {
    expect(venueDayContext(null, '1')).toEqual({ kind: 'unset' });
    expect(venueDayContext({}, '1')).toEqual({ kind: 'unset' });
  });

  it('reports unset for a day the venue has never configured', () => {
    const hours = { '1': { periods: [{ open: '09:00', close: '17:00' }] } } as OpeningHours;
    expect(venueDayContext(hours, '2')).toEqual({ kind: 'unset' });
  });

  it('reads periods, including a third one', () => {
    const hours = {
      '1': {
        periods: [
          { open: '08:00', close: '11:00' },
          { open: '12:00', close: '15:00' },
          { open: '18:00', close: '21:00' },
        ],
      },
    } as OpeningHours;
    expect(venueDayContext(hours, '1')).toEqual({
      kind: 'open',
      periods: [
        { open: '08:00', close: '11:00' },
        { open: '12:00', close: '15:00' },
        { open: '18:00', close: '21:00' },
      ],
    });
  });

  it('reads an explicitly closed day', () => {
    const hours = { '0': { closed: true } } as OpeningHours;
    expect(venueDayContext(hours, '0')).toEqual({ kind: 'closed' });
  });

  it('maps the legacy day-level { open, close } to one period', () => {
    const hours = { '3': { open: '10:00', close: '16:00' } } as unknown as OpeningHours;
    expect(venueDayContext(hours, '3')).toEqual({
      kind: 'open',
      periods: [{ open: '10:00', close: '16:00' }],
    });
  });

  it('treats an unusable entry as unset, not as an intent to close', () => {
    const hours = { '4': {} } as unknown as OpeningHours;
    expect(venueDayContext(hours, '4')).toEqual({ kind: 'unset' });
  });
});

describe('describeVenueDay', () => {
  it('describes each kind', () => {
    expect(describeVenueDay({ kind: 'unset' })).toBe('No business hours set');
    expect(describeVenueDay({ kind: 'closed' })).toBe('Venue closed');
    expect(
      describeVenueDay({ kind: 'open', periods: [{ open: '09:00', close: '17:00' }] }),
    ).toBe('09:00 to 17:00');
  });

  it('joins split windows', () => {
    expect(
      describeVenueDay({
        kind: 'open',
        periods: [
          { open: '09:00', close: '12:00' },
          { open: '13:00', close: '17:00' },
        ],
      }),
    ).toBe('09:00 to 12:00, 13:00 to 17:00');
  });
});

describe('calendarHoursOutsideVenue', () => {
  const open9to17 = { kind: 'open' as const, periods: [{ open: '09:00', close: '17:00' }] };

  it('is false when the calendar sits inside the venue hours', () => {
    expect(calendarHoursOutsideVenue([{ open: '10:00', close: '16:00' }], open9to17)).toBe(false);
  });

  it('is false when the two match exactly', () => {
    expect(calendarHoursOutsideVenue([{ open: '09:00', close: '17:00' }], open9to17)).toBe(false);
  });

  it('is true when the calendar runs past the venue close', () => {
    expect(calendarHoursOutsideVenue([{ open: '10:00', close: '22:00' }], open9to17)).toBe(true);
  });

  it('is true when the calendar opens before the venue', () => {
    expect(calendarHoursOutsideVenue([{ open: '07:00', close: '12:00' }], open9to17)).toBe(true);
  });

  it('never constrains a venue with no hours set', () => {
    expect(calendarHoursOutsideVenue([{ open: '00:00', close: '23:59' }], { kind: 'unset' })).toBe(
      false,
    );
  });

  it('flags any calendar hours at all on a day the venue is closed', () => {
    expect(calendarHoursOutsideVenue([{ open: '10:00', close: '11:00' }], { kind: 'closed' })).toBe(
      true,
    );
  });

  it('is false for a day the calendar does not work', () => {
    expect(calendarHoursOutsideVenue([], open9to17)).toBe(false);
    expect(calendarHoursOutsideVenue(null, { kind: 'closed' })).toBe(false);
  });

  it('flags time falling in the venue lunch gap', () => {
    const split = {
      kind: 'open' as const,
      periods: [
        { open: '09:00', close: '12:00' },
        { open: '13:00', close: '17:00' },
      ],
    };
    expect(calendarHoursOutsideVenue([{ open: '11:00', close: '14:00' }], split)).toBe(true);
    expect(calendarHoursOutsideVenue([{ open: '09:30', close: '11:30' }], split)).toBe(false);
  });

  it('accepts a calendar period spanning several venue windows only when they touch', () => {
    const touching = {
      kind: 'open' as const,
      periods: [
        { open: '09:00', close: '12:00' },
        { open: '12:00', close: '17:00' },
      ],
    };
    expect(calendarHoursOutsideVenue([{ open: '10:00', close: '16:00' }], touching)).toBe(false);
  });

  it('checks every calendar period, not just the first', () => {
    expect(
      calendarHoursOutsideVenue(
        [
          { open: '09:00', close: '12:00' },
          { open: '18:00', close: '20:00' },
        ],
        open9to17,
      ),
    ).toBe(true);
  });
});
