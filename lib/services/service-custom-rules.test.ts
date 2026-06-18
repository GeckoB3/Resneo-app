/**
 * Domain 11 (Services Medium): authoring `specific_dates` + `date_range_pattern`
 * custom-availability rules. Pins the serialisation into
 * `ServiceCustomScheduleV2.rules` and the validation of the new rule kinds.
 */
import {
  makeDateRangePatternRule,
  makeSpecificDatesRule,
  removeRule,
  setDateRange,
  setDateRangeRanges,
  setSpecificDateRanges,
  toggleDayOfWeek,
  toggleSpecificDate,
  upsertRule,
  validateAdvancedRules,
} from '@/lib/services/service-custom-rules';
import type { ServiceCustomScheduleV2 } from '@/types/services-manage';

describe('specific_dates rule', () => {
  it('toggles dates on (with a default window) and off, kept sorted', () => {
    let rule = makeSpecificDatesRule();
    expect(rule.kind).toBe('specific_dates');
    expect(rule.entries).toEqual([]);

    rule = toggleSpecificDate(rule, '2026-07-10');
    rule = toggleSpecificDate(rule, '2026-07-04');
    expect(rule.entries.map((e) => e.date)).toEqual(['2026-07-04', '2026-07-10']);
    expect(rule.entries[0]!.ranges).toEqual([{ start: '09:00', end: '17:00' }]);

    rule = toggleSpecificDate(rule, '2026-07-04');
    expect(rule.entries.map((e) => e.date)).toEqual(['2026-07-10']);
  });

  it('updates the ranges for one date only', () => {
    let rule = makeSpecificDatesRule();
    rule = toggleSpecificDate(rule, '2026-07-10');
    rule = toggleSpecificDate(rule, '2026-07-11');
    rule = setSpecificDateRanges(rule, '2026-07-10', [{ start: '10:00', end: '12:00' }]);
    expect(rule.entries.find((e) => e.date === '2026-07-10')!.ranges).toEqual([
      { start: '10:00', end: '12:00' },
    ]);
    expect(rule.entries.find((e) => e.date === '2026-07-11')!.ranges).toEqual([
      { start: '09:00', end: '17:00' },
    ]);
  });
});

describe('date_range_pattern rule', () => {
  it('seeds Mon–Fri 9–5 across a single day', () => {
    const rule = makeDateRangePatternRule('2026-08-01');
    expect(rule.kind).toBe('date_range_pattern');
    expect(rule.start_date).toBe('2026-08-01');
    expect(rule.end_date).toBe('2026-08-01');
    expect(rule.days_of_week).toEqual([1, 2, 3, 4, 5]);
    expect(rule.ranges).toEqual([{ start: '09:00', end: '17:00' }]);
  });

  it('orders start/end regardless of tap order', () => {
    let rule = makeDateRangePatternRule('2026-08-10');
    rule = setDateRange(rule, '2026-08-20', '2026-08-05');
    expect(rule.start_date).toBe('2026-08-05');
    expect(rule.end_date).toBe('2026-08-20');
  });

  it('toggles weekdays, kept sorted and unique', () => {
    let rule = makeDateRangePatternRule();
    rule = toggleDayOfWeek(rule, 1); // remove Mon
    rule = toggleDayOfWeek(rule, 6); // add Sat
    rule = toggleDayOfWeek(rule, 0); // add Sun
    expect(rule.days_of_week).toEqual([0, 2, 3, 4, 5, 6]);
  });

  it('replaces the daily windows', () => {
    let rule = makeDateRangePatternRule();
    rule = setDateRangeRanges(rule, [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '18:00' },
    ]);
    expect(rule.ranges).toHaveLength(2);
  });
});

describe('schedule serialisation (upsert / remove)', () => {
  it('appends a new rule and never disturbs the others (e.g. the weekly rule)', () => {
    const weekly = { id: 'w1', kind: 'weekly' as const, windows: { '1': [{ start: '09:00', end: '17:00' }] } };
    let schedule: ServiceCustomScheduleV2 = { version: 2, rules: [weekly] };

    const sd = makeSpecificDatesRule();
    schedule = upsertRule(schedule, toggleSpecificDate(sd, '2026-07-10'));
    expect(schedule.rules).toHaveLength(2);
    expect(schedule.rules[0]).toBe(weekly); // untouched

    const dr = makeDateRangePatternRule('2026-09-01');
    schedule = upsertRule(schedule, dr);
    expect(schedule.rules).toHaveLength(3);
    expect(schedule.rules.map((r) => r.kind)).toEqual([
      'weekly',
      'specific_dates',
      'date_range_pattern',
    ]);
  });

  it('updates an existing rule in place by id (no duplicate)', () => {
    let schedule: ServiceCustomScheduleV2 = { version: 2, rules: [] };
    const rule = makeSpecificDatesRule();
    schedule = upsertRule(schedule, rule);
    const updated = toggleSpecificDate(rule, '2026-07-10');
    schedule = upsertRule(schedule, updated);
    expect(schedule.rules).toHaveLength(1);
    expect((schedule.rules[0] as typeof updated).entries).toHaveLength(1);
  });

  it('removes a rule by id', () => {
    const rule = makeSpecificDatesRule();
    let schedule: ServiceCustomScheduleV2 = { version: 2, rules: [rule] };
    schedule = removeRule(schedule, rule.id);
    expect(schedule.rules).toEqual([]);
  });
});

describe('validateAdvancedRules', () => {
  it('passes valid rules', () => {
    const schedule: ServiceCustomScheduleV2 = {
      version: 2,
      rules: [
        { id: 's', kind: 'specific_dates', entries: [{ date: '2026-07-10', ranges: [{ start: '09:00', end: '12:00' }] }] },
        makeDateRangePatternRule('2026-09-01'),
      ],
    };
    expect(validateAdvancedRules(schedule)).toBeNull();
  });

  it('rejects a specific-date window that ends before it starts', () => {
    const schedule: ServiceCustomScheduleV2 = {
      version: 2,
      rules: [{ id: 's', kind: 'specific_dates', entries: [{ date: '2026-07-10', ranges: [{ start: '14:00', end: '09:00' }] }] }],
    };
    expect(validateAdvancedRules(schedule)).toMatch(/specific-date window/i);
  });

  it('rejects a date-range pattern with no weekdays', () => {
    const rule = { ...makeDateRangePatternRule('2026-09-01'), days_of_week: [] };
    const schedule: ServiceCustomScheduleV2 = { version: 2, rules: [rule] };
    expect(validateAdvancedRules(schedule)).toMatch(/weekday/i);
  });

  it('rejects a date-range window that ends before it starts', () => {
    const rule = { ...makeDateRangePatternRule('2026-09-01'), ranges: [{ start: '18:00', end: '09:00' }] };
    const schedule: ServiceCustomScheduleV2 = { version: 2, rules: [rule] };
    expect(validateAdvancedRules(schedule)).toMatch(/date-range window/i);
  });
});
