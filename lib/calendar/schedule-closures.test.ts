import {
  buildCalendarClosureOverlays,
  clampClosureBlocksToWindow,
  isScheduleClosureBlockType,
  leaveForCalendarOnDate,
} from '@/lib/calendar/schedule-closures';

/**
 * The diary drew nothing for a venue closure, a calendar's day off or a
 * fortnight of annual leave — all three were enforced by the booking engine and
 * invisible on the screen staff use to find space. These are the bands that fix
 * that, and the rules that decide which one a given minute gets.
 */

const MONDAY = '2026-08-24'; // a Monday
const NINE_TO_FIVE = { '1': [{ start: '09:00', end: '17:00' }] };
const VENUE_OPEN = [{ start: 9 * 60, end: 17 * 60 }];

describe('leaveForCalendarOnDate', () => {
  const leave = [
    {
      practitioner_id: 'cal-1',
      start_date: '2026-08-24',
      end_date: '2026-08-28',
      unavailable_start_time: null,
      unavailable_end_time: null,
      notes: 'Annual leave',
    },
    {
      practitioner_id: 'cal-2',
      start_date: '2026-08-24',
      end_date: '2026-08-24',
      unavailable_start_time: '14:00:00',
      unavailable_end_time: '16:00:00',
    },
  ];

  it('reads a no-times row as the whole day', () => {
    expect(leaveForCalendarOnDate('cal-1', MONDAY, leave)).toEqual({
      fullDay: true,
      partial: [],
      note: 'Annual leave',
    });
  });

  it('keeps a timed row as its window', () => {
    expect(leaveForCalendarOnDate('cal-2', MONDAY, leave)).toEqual({
      fullDay: false,
      partial: [{ start: 14 * 60, end: 16 * 60 }],
      note: null,
    });
  });

  it('ignores other calendars and dates outside the period', () => {
    expect(leaveForCalendarOnDate('cal-3', MONDAY, leave).fullDay).toBe(false);
    expect(leaveForCalendarOnDate('cal-1', '2026-09-01', leave).fullDay).toBe(false);
  });
});

describe('buildCalendarClosureOverlays', () => {
  function build(overrides: Partial<Parameters<typeof buildCalendarClosureOverlays>[0]> = {}) {
    return buildCalendarClosureOverlays({
      calendarId: 'cal-1',
      dateStr: MONDAY,
      calendar: { working_hours: NINE_TO_FIVE },
      leavePeriods: [],
      venueOpenRanges: VENUE_OPEN,
      ...overrides,
    });
  }

  it('shades the venue hours a calendar does not work', () => {
    const bands = build({ calendar: { working_hours: { '1': [{ start: '12:00', end: '17:00' }] } } });
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({
      start: '09:00',
      end: '12:00',
      label: 'Closed',
      blockType: 'practitioner_closed',
    });
  });

  it('draws nothing when the calendar works the venue’s whole day', () => {
    expect(build()).toEqual([]);
  });

  it('closes the day for a `days_off` DATE and for a weekday name alike', () => {
    // Both forms are live in stored data; the engines honour both, so the diary
    // has to as well or a permanently-closed Monday looks bookable.
    for (const dayOff of [MONDAY, 'mon']) {
      const bands = build({ calendar: { working_hours: NINE_TO_FIVE, days_off: [dayOff] } });
      expect(bands).toEqual([
        expect.objectContaining({ start: '09:00', end: '17:00', blockType: 'practitioner_closed' }),
      ]);
    }
  });

  it('leaves a calendar with no weekly shape unshaded', () => {
    // A column nobody has set up is unconstrained, not closed: greying every
    // hour of every day would be a statement the venue never made.
    expect(build({ calendar: { working_hours: {} } })).toEqual([]);
    expect(build({ calendar: null })).toEqual([]);
  });

  it('says "On leave" for a full day, and says it INSTEAD of "Closed"', () => {
    const bands = build({
      calendar: { working_hours: NINE_TO_FIVE },
      leavePeriods: [
        {
          practitioner_id: 'cal-1',
          start_date: MONDAY,
          end_date: MONDAY,
          unavailable_start_time: null,
          unavailable_end_time: null,
          notes: 'Annual leave',
        },
      ],
    });
    expect(bands).toEqual([
      expect.objectContaining({
        start: '09:00',
        end: '17:00',
        label: 'On leave — Annual leave',
        blockType: 'practitioner_leave',
      }),
    ]);
  });

  it('clips partial leave to the hours worked, as its own band', () => {
    // Not merged into the closed band: "on leave 2–4" and "does not work
    // Wednesday afternoons" are different facts, and only the first is a wall.
    const bands = build({
      calendar: { working_hours: { '1': [{ start: '09:00', end: '13:00' }] } },
      leavePeriods: [
        {
          practitioner_id: 'cal-1',
          start_date: MONDAY,
          end_date: MONDAY,
          unavailable_start_time: '12:00',
          unavailable_end_time: '16:00',
        },
      ],
    });
    expect(bands).toEqual([
      expect.objectContaining({ start: '13:00', end: '17:00', blockType: 'practitioner_closed' }),
      // Clipped at 13:00 — the venue-closed part is already shaded once.
      expect.objectContaining({ start: '12:00', end: '13:00', blockType: 'practitioner_leave' }),
    ]);
  });

  it('lets a per-date override replace the weekly hours, and marks the day amended', () => {
    const bands = build({
      calendar: {
        working_hours: NINE_TO_FIVE,
        availability_exceptions: { [MONDAY]: { periods: [{ start: '11:00', end: '15:00' }] } },
      },
    });
    expect(bands).toEqual([
      expect.objectContaining({ start: '09:00', end: '11:00', blockType: 'practitioner_closed' }),
      expect.objectContaining({ start: '15:00', end: '17:00', blockType: 'practitioner_closed' }),
      expect.objectContaining({
        start: '11:00',
        end: '15:00',
        label: 'Amended hours',
        blockType: 'calendar_amended_hours',
      }),
    ]);
  });

  it('honours a `{closed:true}` override', () => {
    const bands = build({
      calendar: {
        working_hours: NINE_TO_FIVE,
        availability_exceptions: { [MONDAY]: { closed: true } },
      },
    });
    expect(bands).toEqual([
      expect.objectContaining({ start: '09:00', end: '17:00', blockType: 'practitioner_closed' }),
    ]);
  });

  it('falls back to the whole day when the venue imposes no hours', () => {
    // An appointments venue often has no opening_hours at all; the calendar's
    // own shape is then the only boundary there is.
    const bands = build({ venueOpenRanges: [] });
    expect(bands).toEqual([
      expect.objectContaining({ start: '00:00', end: '09:00' }),
      expect.objectContaining({ start: '17:00', end: '23:59' }),
    ]);
  });
});

describe('clampClosureBlocksToWindow', () => {
  const window = { start: 8 * 60, end: 18 * 60 };

  it('clips a full-day band to the visible window', () => {
    const [clipped] = clampClosureBlocksToWindow(
      [{ block: { blockType: 'practitioner_leave' }, start: 0, end: 24 * 60 - 1 }],
      window.start,
      window.end,
    );
    expect(clipped).toEqual({
      block: { blockType: 'practitioner_leave' },
      start: window.start,
      end: window.end,
    });
  });

  it('drops a band that falls entirely outside', () => {
    expect(
      clampClosureBlocksToWindow(
        [{ block: { blockType: 'practitioner_closed' }, start: 0, end: 7 * 60 }],
        window.start,
        window.end,
      ),
    ).toEqual([]);
  });

  it('leaves real blocks alone, even ones outside the window', () => {
    // A booking or manual block outside the window means the window is wrong,
    // and the grid widens for those. Only synthetic bands are clipped.
    const entry = { block: { blockType: 'manual' }, start: 6 * 60, end: 7 * 60 };
    expect(clampClosureBlocksToWindow([entry], window.start, window.end)).toEqual([entry]);
  });
});

describe('isScheduleClosureBlockType', () => {
  it('covers both the app-generated and web-computed closure names', () => {
    for (const t of [
      'practitioner_closed',
      'practitioner_leave',
      'calendar_amended_hours',
      'venue_closed',
      'venue_amended_hours',
    ]) {
      expect(isScheduleClosureBlockType(t)).toBe(true);
    }
  });

  it('is false for anything booked or hand-made', () => {
    for (const t of ['manual', 'break', 'class_session', undefined, null]) {
      expect(isScheduleClosureBlockType(t)).toBe(false);
    }
  });
});
