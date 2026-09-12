import {
  buildCalendarClosureOverlays,
  clampClosureBlocksToWindow,
  isScheduleClosureBlockType,
  leaveForCalendarOnDate,
  partitionClosureBands,
  scheduleClosureBlockLabel,
} from '@/lib/calendar/schedule-closures';

/**
 * The diary drew nothing for a venue closure, a calendar's day off or a
 * fortnight of annual leave — all three were enforced by the booking engine and
 * invisible on the screen staff use to find space. These are the bands that fix
 * that, and the rules that decide which one a given minute gets.
 *
 * Since the web's 2026-09-10 stripes the builder covers the WHOLE day and the
 * grid partitions its bands against the venue's closed minutes, so every
 * minute carries exactly one explanation (see `partitionClosureBands`).
 */

const MONDAY = '2026-08-24'; // a Monday
const NINE_TO_FIVE = { '1': [{ start: '09:00', end: '17:00' }] };

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
      leaveType: null,
    });
  });

  it('keeps a timed row as its window', () => {
    expect(leaveForCalendarOnDate('cal-2', MONDAY, leave)).toEqual({
      fullDay: false,
      partial: [{ start: 14 * 60, end: 16 * 60 }],
      note: null,
      leaveType: null,
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
      ...overrides,
    });
  }

  describe('rotating schedule (R23-2)', () => {
    // MONDAY (24 Aug 2026) is week 2 of a two-week rota that started Mon 17 Aug.
    const WEEK_ONE = { '1': [{ start: '09:00', end: '17:00' }] };
    const WEEK_TWO = { '1': [{ start: '13:00', end: '17:00' }] };
    const timeline = {
      version: 1,
      periods: [{ id: 'p', from: '2026-08-17', until: null, weeks: [WEEK_ONE, WEEK_TWO] }],
    };

    it('greys the hours of the rota week that covers the date, not the base week', () => {
      const bands = build({ calendar: { working_hours: NINE_TO_FIVE, schedule_periods: timeline } });
      expect(bands.map((b) => [b.start, b.end])).toEqual([
        ['00:00', '13:00'],
        ['17:00', '23:59'],
      ]);
    });

    it('returns to the base week on a date no period covers', () => {
      const ended = { ...timeline, periods: [{ ...timeline.periods[0]!, until: '2026-08-23' }] };
      expect(
        build({ calendar: { working_hours: NINE_TO_FIVE, schedule_periods: ended } }).map((b) => [b.start, b.end]),
      ).toEqual([
        ['00:00', '09:00'],
        ['17:00', '23:59'],
      ]);
    });

    it('treats a calendar with an empty base week but a schedule as set up', () => {
      const bands = build({ calendar: { working_hours: {}, schedule_periods: timeline } });
      expect(bands.map((b) => [b.start, b.end])).toEqual([
        ['00:00', '13:00'],
        ['17:00', '23:59'],
      ]);
    });
  });

  it('shades the whole of the day a calendar does not work', () => {
    const bands = build({ calendar: { working_hours: { '1': [{ start: '12:00', end: '17:00' }] } } });
    expect(bands).toEqual([
      expect.objectContaining({ start: '00:00', end: '12:00', blockType: 'practitioner_closed' }),
      expect.objectContaining({ start: '17:00', end: '23:59', blockType: 'practitioner_closed' }),
    ]);
  });

  it('closes the day for a `days_off` DATE and for a weekday name alike', () => {
    // Both forms are live in stored data; the engines honour both, so the diary
    // has to as well or a permanently-closed Monday looks bookable.
    for (const dayOff of [MONDAY, 'mon']) {
      const bands = build({ calendar: { working_hours: NINE_TO_FIVE, days_off: [dayOff] } });
      expect(bands).toEqual([
        expect.objectContaining({ start: '00:00', end: '23:59', blockType: 'practitioner_closed' }),
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
        start: '00:00',
        end: '23:59',
        // The note is not shown, as on the web (leave blocks carry no reason);
        // the grid relabels the stripe with its own minutes.
        label: 'On leave',
        blockType: 'practitioner_leave',
      }),
    ]);
  });

  /**
   * Device test, 2026-09-12: a day entered as **Closed**, and listed as
   * "Staff 1 · Closed", drew a band reading "On leave 09:00 to 22:00". The
   * editor calls that field "Label"; it now reaches the diary.
   */
  it('says the word the team chose on the band', () => {
    const withType = (leave_type: string | null) =>
      build({
        calendar: { working_hours: NINE_TO_FIVE },
        leavePeriods: [
          {
            practitioner_id: 'cal-1',
            start_date: MONDAY,
            end_date: MONDAY,
            unavailable_start_time: null,
            unavailable_end_time: null,
            leave_type,
          },
        ],
      })[0];

    expect(withType('annual')).toEqual(
      expect.objectContaining({ label: 'Closed', leaveLabel: 'Closed' }),
    );
    expect(withType('sick')).toEqual(
      expect.objectContaining({ label: 'Unavailable', leaveLabel: 'Unavailable' }),
    );
    // "Other" says nothing on a stripe, so it keeps the meaningful default.
    expect(withType('other')?.label).toBe('On leave');
    expect(withType(null)?.label).toBe('On leave');
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
      expect.objectContaining({ start: '00:00', end: '09:00', blockType: 'practitioner_closed' }),
      expect.objectContaining({ start: '13:00', end: '23:59', blockType: 'practitioner_closed' }),
      expect.objectContaining({ start: '12:00', end: '13:00', blockType: 'practitioner_leave' }),
    ]);
  });

  it('lets a per-date override replace the weekly hours, with no band over the amended window', () => {
    // Web retired its "Amended hours" band: the open part of an amended day
    // looks like any other working day, and the grid follows the hours.
    const bands = build({
      calendar: {
        working_hours: NINE_TO_FIVE,
        availability_exceptions: { [MONDAY]: { periods: [{ start: '11:00', end: '15:00' }] } },
      },
    });
    expect(bands).toEqual([
      expect.objectContaining({ start: '00:00', end: '11:00', blockType: 'practitioner_closed' }),
      expect.objectContaining({ start: '15:00', end: '23:59', blockType: 'practitioner_closed' }),
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
      expect.objectContaining({ start: '00:00', end: '23:59', blockType: 'practitioner_closed' }),
    ]);
  });
});

describe('partitionClosureBands', () => {
  // A grid window of 08:00–20:00; the venue opens 09:00–18:00, so it is shut
  // 08:00–09:00 and 18:00–20:00 inside the window.
  const VENUE_SHUT = [
    { start: 8 * 60, end: 9 * 60 },
    { start: 18 * 60, end: 20 * 60 },
  ];
  const closed = (id: string, start: number, end: number) => ({
    block: { id, blockType: 'practitioner_closed', label: 'Closed' },
    start,
    end,
  });

  it('gives every minute one cause: venue only, calendar only, or both', () => {
    // Hannah works 10:00–19:00: shut before 10 (both 8–9, hers 9–10) and after
    // 19 (venue 18–19 while she works, both 19–20).
    const out = partitionClosureBands({
      venueClosed: VENUE_SHUT,
      entries: [closed('a', 8 * 60, 10 * 60), closed('b', 19 * 60, 20 * 60)],
      columnName: 'Hannah',
      keyPrefix: 'cal-1',
    });
    expect(out.map((e) => [e.block.blockType, e.start, e.end, e.block.label])).toEqual([
      ['venue_closed', 18 * 60, 19 * 60, 'Venue closed 18:00 to 19:00'],
      ['practitioner_closed', 9 * 60, 10 * 60, 'Hannah unavailable 09:00 to 10:00'],
      ['venue_and_calendar_closed', 8 * 60, 9 * 60, 'Hannah closed 08:00 to 09:00'],
      ['venue_and_calendar_closed', 19 * 60, 20 * 60, 'Hannah closed 19:00 to 20:00'],
    ]);
  });

  it('draws the venue stripes alone when the calendar works the whole window', () => {
    const out = partitionClosureBands({ venueClosed: VENUE_SHUT, entries: [], keyPrefix: 'cal-1' });
    expect(out.map((e) => e.block.blockType)).toEqual(['venue_closed', 'venue_closed']);
  });

  it("names a partner's shut hours as the linked venue's", () => {
    const out = partitionClosureBands({
      venueClosed: VENUE_SHUT,
      entries: [],
      linked: true,
      keyPrefix: 'linked:v:c',
    });
    expect(out[0]!.block).toMatchObject({
      blockType: 'linked_venue_closed',
      label: 'Linked venue closed 08:00 to 09:00',
    });
  });

  it('keeps leave whole — over the venue-closed minutes too — and passes breaks and manual blocks through', () => {
    type Entry = { block: { id: string; blockType: string; label: string | null }; start: number; end: number };
    const leave: Entry = { block: { id: 'l', blockType: 'practitioner_leave', label: 'On leave' }, start: 8 * 60, end: 20 * 60 };
    const brk: Entry = { block: { id: 'k', blockType: 'break', label: 'Break' }, start: 12 * 60, end: 13 * 60 };
    const manual: Entry = { block: { id: 'm', blockType: 'manual', label: null }, start: 14 * 60, end: 15 * 60 };
    const out = partitionClosureBands({
      venueClosed: VENUE_SHUT,
      entries: [leave, brk, manual],
      keyPrefix: 'cal-1',
    });
    // Leave is the one band the drag refuses, and the server refuses it
    // outside the venue's hours too (full-day leave survives even
    // `allowOutsideHours`), so clipping it there would show a drop as allowed
    // that the server will refuse. Web passes leave through untouched.
    expect(out.filter((e) => e.block.blockType === 'practitioner_leave')).toEqual([
      {
        block: { id: 'l', blockType: 'practitioner_leave', label: 'On leave 08:00 to 20:00' },
        start: 8 * 60,
        end: 20 * 60,
      },
    ]);
    expect(out.find((e) => e.block.id === 'k')).toEqual(brk);
    expect(out.find((e) => e.block.id === 'm')).toEqual(manual);
  });

  it("re-adds the minutes to the band's own word, not to a fixed one", () => {
    const out = partitionClosureBands({
      venueClosed: [],
      entries: [
        {
          block: {
            id: 'l',
            blockType: 'practitioner_leave',
            label: 'Closed',
            leaveLabel: 'Closed',
          },
          start: 9 * 60,
          end: 17 * 60,
        },
      ],
      keyPrefix: 'cal-1',
    });
    expect(out[0]!.block.label).toBe('Closed 09:00 to 17:00');
  });
});

describe('scheduleClosureBlockLabel', () => {
  it('says why and which minutes, naming the calendar where it is the cause', () => {
    const range = { startTime: '08:00:00', endTime: '09:00:00' };
    expect(scheduleClosureBlockLabel('venue_closed', range)).toBe('Venue closed 08:00 to 09:00');
    expect(scheduleClosureBlockLabel('practitioner_closed', { columnName: 'Hannah', ...range })).toBe(
      'Hannah unavailable 08:00 to 09:00',
    );
    expect(scheduleClosureBlockLabel('practitioner_closed', range)).toBe('Calendar unavailable 08:00 to 09:00');
    expect(scheduleClosureBlockLabel('venue_and_calendar_closed', { columnName: 'Hannah', ...range })).toBe(
      'Hannah closed 08:00 to 09:00',
    );
    expect(scheduleClosureBlockLabel('practitioner_leave', range)).toBe('On leave 08:00 to 09:00');
    expect(scheduleClosureBlockLabel('practitioner_leave', { ...range, leaveLabel: 'Closed' })).toBe(
      'Closed 08:00 to 09:00',
    );
    expect(scheduleClosureBlockLabel('practitioner_leave', { ...range, leaveLabel: '  ' })).toBe(
      'On leave 08:00 to 09:00',
    );
    expect(scheduleClosureBlockLabel('linked_venue_closed')).toBe('Linked venue closed');
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
      'venue_and_calendar_closed',
      'linked_venue_closed',
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
