/**
 * Read-side port of web's working-hours-rota (resneo 7acff0ba). The fixtures
 * and expectations are web's own, so the app resolves exactly the week the
 * server books against.
 */
import {
  addDaysYmd,
  describePeriod,
  describeScheduleSource,
  effectiveWorkingHoursForDate,
  isMondayYmd,
  legacyRotaToSchedule,
  mondayOnOrBefore,
  parseCalendarSchedule,
  parseWorkingHoursRota,
  resolveScheduleForDate,
  scheduleForRow,
  sundayOnOrAfter,
  validateCalendarSchedule,
  weekIndexInPeriod,
  type CalendarSchedule,
  type SchedulePeriod,
  schedulePeriodHasEnded,
} from '@/lib/calendar/working-hours-rota';

/** Monday 7 September 2026. */
const START = '2026-09-07';
const WEEK_A = {
  '1': [{ start: '09:00', end: '17:00' }],
  '2': [{ start: '09:00', end: '17:00' }],
  '6': [{ start: '09:00', end: '13:00' }],
};
const WEEK_B = {
  '2': [{ start: '09:00', end: '21:00' }],
  '3': [{ start: '09:00', end: '21:00' }],
  '4': [{ start: '09:00', end: '21:00' }],
  '5': [{ start: '09:00', end: '21:00' }],
};
const WEEK_C = { '1': [{ start: '10:00', end: '14:00' }] };

const period = (over: Partial<SchedulePeriod> = {}): SchedulePeriod => ({
  id: 'p1',
  from: START,
  until: null,
  cycle_start: START,
  weeks: [WEEK_A, WEEK_B],
  ...over,
});
const schedule = (...periods: SchedulePeriod[]): CalendarSchedule => ({ version: 1, periods });

describe('date helpers', () => {
  it('finds week boundaries without a timezone', () => {
    expect(isMondayYmd('2026-09-07')).toBe(true);
    expect(mondayOnOrBefore('2026-09-13')).toBe('2026-09-07');
    expect(sundayOnOrAfter('2026-09-07')).toBe('2026-09-13');
    expect(sundayOnOrAfter('2026-09-13')).toBe('2026-09-13');
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('validateCalendarSchedule', () => {
  it('accepts a sorted, non-overlapping timeline and defaults cycle_start', () => {
    const out = validateCalendarSchedule({
      version: 1,
      periods: [
        { id: 'b', from: '2026-10-05', until: null, weeks: [WEEK_C] },
        { id: 'a', from: START, until: '2026-10-04', weeks: [WEEK_A, WEEK_B] },
      ],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.schedule.periods.map((p) => p.id)).toEqual(['a', 'b']);
      expect(out.schedule.periods[1]!.cycle_start).toBe('2026-10-05');
    }
  });

  it('names what is wrong', () => {
    const bad = (p: Record<string, unknown>) => validateCalendarSchedule({ version: 1, periods: [p] });
    expect(bad({ id: 'x', from: '2026-09-08', until: null, weeks: [WEEK_A] })).toMatchObject({
      ok: false,
      error: /start on a Monday/,
    });
    expect(bad({ id: 'x', from: START, until: '2026-09-12', weeks: [WEEK_A] })).toMatchObject({
      ok: false,
      error: /end on a Sunday/,
    });
    expect(bad({ id: 'x', from: START, until: '2026-08-30', weeks: [WEEK_A] })).toMatchObject({
      ok: false,
      error: /end on or after/,
    });
    expect(bad({ id: 'x', from: START, until: null, weeks: [] })).toMatchObject({
      ok: false,
      error: /1 to 6 weeks/,
    });
    expect(
      bad({ id: 'x', from: START, until: null, cycle_start: '2026-09-14', weeks: [WEEK_A] }),
    ).toMatchObject({ ok: false, error: /cycle start/ });
    expect(
      validateCalendarSchedule({
        version: 1,
        periods: [
          { id: 'a', from: START, until: null, weeks: [WEEK_A] },
          { id: 'b', from: '2026-10-05', until: null, weeks: [WEEK_C] },
        ],
      }),
    ).toMatchObject({ ok: false, error: /must not overlap/ });
    expect(validateCalendarSchedule({ version: 2, periods: [] })).toMatchObject({ ok: false });
    expect(parseCalendarSchedule('garbage')).toBeNull();
  });
});

describe('resolution', () => {
  const row = {
    working_hours: { '1': [{ start: '10:00', end: '12:00' }] },
    schedule_periods: schedule(
      period({ id: 'rota', until: '2026-10-04' }),
      period({ id: 'later', from: '2026-11-02', cycle_start: '2026-11-02', weeks: [WEEK_C] }),
    ),
  };

  it('uses the covering period and its week, and the base hours in the gaps', () => {
    expect(resolveScheduleForDate(row, '2026-09-08')).toMatchObject({
      hours: WEEK_A,
      source: { kind: 'period', periodIndex: 0, weekIndex: 0 },
    });
    expect(resolveScheduleForDate(row, '2026-09-15')).toMatchObject({
      hours: WEEK_B,
      source: { weekIndex: 1 },
    });
    expect(resolveScheduleForDate(row, '2026-10-04')).toMatchObject({ hours: WEEK_B });
    expect(resolveScheduleForDate(row, '2026-10-05')).toMatchObject({
      hours: row.working_hours,
      source: { kind: 'base' },
    });
    expect(resolveScheduleForDate(row, '2026-11-02')).toMatchObject({
      hours: WEEK_C,
      source: { periodIndex: 1, weekIndex: 0 },
    });
    expect(effectiveWorkingHoursForDate(row, '2026-09-01')).toEqual(row.working_hours);
  });

  it("keeps a rota's rhythm after a split through cycle_start", () => {
    const right = period({ id: 'right', from: '2026-09-21', cycle_start: START });
    expect(weekIndexInPeriod(right, '2026-09-21')).toBe(0);
    expect(weekIndexInPeriod(right, '2026-09-28')).toBe(1);
  });

  it('falls back to the older single rota only while schedule_periods is null', () => {
    const rota = { version: 1, cycle_start: START, weeks: [WEEK_A, WEEK_B], repeat_until: '2026-09-30' };
    expect(parseWorkingHoursRota(rota)).not.toBeNull();
    expect(legacyRotaToSchedule(parseWorkingHoursRota(rota)!).periods[0]!.until).toBe('2026-10-04');
    expect(scheduleForRow({ working_hours_rota: rota })?.periods[0]!.weeks).toEqual([WEEK_A, WEEK_B]);
    expect(
      scheduleForRow({ schedule_periods: schedule(period({ weeks: [WEEK_C] })), working_hours_rota: rota })
        ?.periods[0]!.weeks,
    ).toEqual([WEEK_C]);
    expect(scheduleForRow({ schedule_periods: 'garbage', working_hours_rota: rota })).toBeNull();
  });

  it('answers with the base hours for a row that carries no schedule at all', () => {
    const plain = { working_hours: WEEK_C };
    expect(resolveScheduleForDate(plain, '2026-09-08')).toEqual({ hours: WEEK_C, source: { kind: 'base' } });
    expect(resolveScheduleForDate({}, '2026-09-08')).toEqual({ hours: {}, source: { kind: 'base' } });
  });
});

describe('describing', () => {
  it('words a period the way the web timeline does', () => {
    expect(describePeriod(period({ until: '2026-10-04' }))).toBe(
      'From 7 Sep 2026, until 4 Oct 2026: 2-week rota',
    );
    expect(describePeriod(period({ weeks: [WEEK_C] }))).toBe(
      'From 7 Sep 2026, until further notice: same hours every week',
    );
  });

  it('names the rule that set a date', () => {
    expect(describeScheduleSource({ kind: 'base' })).toBe('Standard weekly hours');
    expect(
      describeScheduleSource({ kind: 'period', period: period(), periodIndex: 0, weekIndex: 1 }),
    ).toBe('Change from 7 Sep 2026, week 2 of 2');
    expect(
      describeScheduleSource({
        kind: 'period',
        period: period({ weeks: [WEEK_C] }),
        periodIndex: 0,
        weekIndex: 0,
      }),
    ).toBe('Change from 7 Sep 2026');
  });
});

describe('schedulePeriodHasEnded', () => {
  it('ends the day after its last day; an open-ended period never ends', () => {
    const period = { until: '2026-09-06' };
    expect(schedulePeriodHasEnded(period, '2026-09-06')).toBe(false);
    expect(schedulePeriodHasEnded(period, '2026-09-07')).toBe(true);
    expect(schedulePeriodHasEnded({ until: null }, '2030-01-01')).toBe(false);
  });
});
