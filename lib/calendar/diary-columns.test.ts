import {
  diaryCalendarsForIdsKey,
  diaryColumnCalendarIdsKey,
  diaryColumnCalendars,
  diaryColumnLabel,
  diaryColumnTakesNewBookings,
  holdsAppointmentTime,
  pausedColumnChangeRefusal,
  pausedColumnCreateMessage,
  pausedColumnDropMessage,
  type DiaryColumnGrid,
} from '@/lib/calendar/diary-columns';

const ANNA = { id: 'anna', name: 'Anna', is_active: true, sort_order: 0 };
const MARCUS = { id: 'marcus', name: 'Marcus', is_active: false, sort_order: 1 };
const ZOE = { id: 'zoe', name: 'Zoe', is_active: true, sort_order: 2 };
const ROOM = { id: 'room', name: 'Room 1', is_active: true, sort_order: 3, calendar_type: 'resource' };
const ROSTER = [ZOE, ROOM, MARCUS, ANNA];

function gridWith(calendarId: string, date: string, statuses: string[]): DiaryColumnGrid {
  return {
    calendars: [
      { calendarId, dates: [{ date, bookings: statuses.map((status) => ({ status })) }] },
    ],
  };
}

const ids = (calendars: { id: string }[]) => calendars.map((c) => c.id);

describe('diaryColumnCalendars (R44-3)', () => {
  it('draws active calendars only when a paused one has nothing in view', () => {
    const drawn = diaryColumnCalendars({
      calendars: ROSTER,
      grid: { calendars: [] },
      from: '2026-10-05',
      to: '2026-10-05',
    });
    expect(ids(drawn)).toEqual(['anna', 'zoe']);
  });

  it('keeps a paused calendar that still has a live booking on a date in view', () => {
    const drawn = diaryColumnCalendars({
      calendars: ROSTER,
      grid: gridWith('marcus', '2026-10-05', ['Booked']),
      from: '2026-10-05',
      to: '2026-10-05',
    });
    // In column order, between its neighbours, not appended.
    expect(ids(drawn)).toEqual(['anna', 'marcus', 'zoe']);
  });

  it.each(['Booked', 'Confirmed', 'Pending', 'Seated', 'Completed'])(
    'counts a %s booking as live',
    (status) => {
      const drawn = diaryColumnCalendars({
        calendars: ROSTER,
        grid: gridWith('marcus', '2026-10-05', [status]),
        from: '2026-10-05',
        to: '2026-10-05',
      });
      expect(ids(drawn)).toContain('marcus');
    },
  );

  it.each(['No-Show', 'Cancelled'])('does not keep the column for a %s booking alone', (status) => {
    const drawn = diaryColumnCalendars({
      calendars: ROSTER,
      grid: gridWith('marcus', '2026-10-05', [status]),
      from: '2026-10-05',
      to: '2026-10-05',
    });
    expect(ids(drawn)).not.toContain('marcus');
  });

  it('ignores a booking outside the dates in view', () => {
    // `keepPreviousData` leaves the last range in the cache while the next loads.
    const drawn = diaryColumnCalendars({
      calendars: ROSTER,
      grid: gridWith('marcus', '2026-10-04', ['Booked']),
      from: '2026-10-05',
      to: '2026-10-05',
    });
    expect(ids(drawn)).not.toContain('marcus');
  });

  it('keeps the row for the whole week when one day of it has a booking', () => {
    const drawn = diaryColumnCalendars({
      calendars: ROSTER,
      grid: gridWith('marcus', '2026-10-08', ['Confirmed']),
      from: '2026-10-05',
      to: '2026-10-11',
    });
    expect(ids(drawn)).toContain('marcus');
  });

  it('keeps a paused calendar with a class, event or resource booking placed on it', () => {
    const drawn = diaryColumnCalendars({
      calendars: ROSTER,
      grid: { calendars: [] },
      scheduleBlocks: [{ date: '2026-10-05', calendar_id: 'marcus', status: 'Booked' }],
      from: '2026-10-05',
      to: '2026-10-05',
    });
    expect(ids(drawn)).toContain('marcus');
  });

  it('ignores a cancelled schedule block, one with no calendar and one out of view', () => {
    const drawn = diaryColumnCalendars({
      calendars: ROSTER,
      grid: null,
      scheduleBlocks: [
        { date: '2026-10-05', calendar_id: 'marcus', status: 'Cancelled' },
        { date: '2026-10-05', calendar_id: null },
        { date: '2026-10-06', calendar_id: 'marcus' },
      ],
      from: '2026-10-05',
      to: '2026-10-05',
    });
    expect(ids(drawn)).toEqual(['anna', 'zoe']);
  });

  it('never draws a resource calendar as a column', () => {
    const drawn = diaryColumnCalendars({
      calendars: ROSTER,
      grid: gridWith('room', '2026-10-05', ['Booked']),
      from: '2026-10-05',
      to: '2026-10-05',
    });
    expect(ids(drawn)).not.toContain('room');
  });
});

describe('diaryColumnCalendarIdsKey', () => {
  it('names the drawn calendars in order and round-trips to the rows', () => {
    const key = diaryColumnCalendarIdsKey({
      calendars: ROSTER,
      grid: gridWith('marcus', '2026-10-05', ['Booked']),
      from: '2026-10-05',
      to: '2026-10-05',
    });
    expect(key).toBe('anna,marcus,zoe');
    expect(diaryCalendarsForIdsKey(ROSTER, key)).toEqual([ANNA, MARCUS, ZOE]);
  });

  it('does not change when a booking changes on a calendar already drawn', () => {
    const params = { calendars: ROSTER, from: '2026-10-05', to: '2026-10-05' };
    expect(
      diaryColumnCalendarIdsKey({ ...params, grid: gridWith('anna', '2026-10-05', ['Booked']) }),
    ).toBe(
      diaryColumnCalendarIdsKey({
        ...params,
        grid: gridWith('anna', '2026-10-05', ['Booked', 'Completed']),
      }),
    );
  });

  it('is empty for no calendars', () => {
    expect(diaryCalendarsForIdsKey(ROSTER, '')).toEqual([]);
  });
});

describe('paused column rules', () => {
  it('a paused column takes nothing new; an active one does', () => {
    expect(diaryColumnTakesNewBookings(MARCUS)).toBe(false);
    expect(diaryColumnTakesNewBookings(ANNA)).toBe(true);
  });

  it('labels a paused calendar in the chips', () => {
    expect(diaryColumnLabel(MARCUS)).toBe('Marcus (paused)');
    expect(diaryColumnLabel(ANNA)).toBe('Anna');
  });

  it('says why a tap or a drop on a paused column did nothing, with no em-dash', () => {
    for (const message of [pausedColumnCreateMessage('Marcus'), pausedColumnDropMessage('Marcus')]) {
      expect(message).toContain('Marcus is paused');
      expect(message).not.toContain('—');
    }
  });

  it('knows which statuses hold time', () => {
    expect(holdsAppointmentTime('Seated')).toBe(true);
    expect(holdsAppointmentTime('No-Show')).toBe(false);
    expect(holdsAppointmentTime(null)).toBe(false);
  });
});

describe('pausedColumnChangeRefusal', () => {
  it('explains the engine\'s "Staff not available" on a paused calendar', () => {
    const text = pausedColumnChangeRefusal('Staff not available', 'Marcus');
    expect(text).toContain('Marcus is paused');
    expect(text).toContain('Move it to another calendar');
  });

  it('reads the reason inside a longer sentence too (a visit names its service first)', () => {
    expect(
      pausedColumnChangeRefusal('Cut at 10:00: Staff not available. The visit was not moved.', 'Marcus'),
    ).toContain('Marcus is paused');
  });

  it('leaves every other refusal, and every active calendar, to the server\'s words', () => {
    expect(pausedColumnChangeRefusal('That time is taken', 'Marcus')).toBeNull();
    expect(pausedColumnChangeRefusal('Staff not available', null)).toBeNull();
    expect(pausedColumnChangeRefusal(null, 'Marcus')).toBeNull();
  });
});
