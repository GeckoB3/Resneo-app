import {
  END_OF_DAY_MIN,
  canAddPeriod,
  nextPeriodAfter,
  type MinutePeriod,
} from '@/lib/scheduling/weekly-hours';

const at = (h: number, m = 0) => h * 60 + m;

describe('canAddPeriod', () => {
  it('allows the first period of an empty day', () => {
    expect(canAddPeriod([])).toBe(true);
  });

  it('allows another period when an hour still fits before 23:59', () => {
    expect(canAddPeriod([{ start: at(9), end: at(17) }])).toBe(true);
  });

  it('refuses when the last period ends too late to fit another', () => {
    // 23:00 + 60 = 24:00, past 23:59.
    expect(canAddPeriod([{ start: at(20), end: at(23) }])).toBe(false);
  });

  it('is exact at the boundary — 22:59 fits, 23:00 does not', () => {
    expect(canAddPeriod([{ start: at(9), end: at(22, 59) }])).toBe(true);
    expect(canAddPeriod([{ start: at(9), end: at(23) }])).toBe(false);
  });

  it('looks at the LAST period, not the first', () => {
    const periods: MinutePeriod[] = [
      { start: at(9), end: at(12) },
      { start: at(13), end: at(23, 30) },
    ];
    expect(canAddPeriod(periods)).toBe(false);
  });
});

describe('nextPeriodAfter', () => {
  it('opens an hour after the previous close, an hour long', () => {
    expect(nextPeriodAfter({ start: at(9), end: at(17) })).toEqual({
      start: at(18),
      end: at(19),
    });
  });

  it('never collides with the period before it', () => {
    const previous = { start: at(9), end: at(17) };
    expect(nextPeriodAfter(previous).start).toBeGreaterThan(previous.end);
  });

  it('does not repeat a fixed default when the day has moved on', () => {
    // The old bug: adding a split to a 09:00–17:00 day handed back 09:00–17:00.
    const previous = { start: at(9), end: at(17) };
    expect(nextPeriodAfter(previous)).not.toEqual(previous);
  });

  it('clamps the end to 23:59 rather than spilling past midnight', () => {
    // 22:30 + 60 = 23:30 start; 23:30 + 60 would be 00:30 the next day.
    expect(nextPeriodAfter({ start: at(20), end: at(22, 30) })).toEqual({
      start: at(23, 30),
      end: END_OF_DAY_MIN,
    });
  });

  it('falls back to the supplied opening time when the day has no periods', () => {
    expect(nextPeriodAfter(undefined)).toEqual({ start: at(9), end: at(17) });
    expect(nextPeriodAfter(undefined, at(8))).toEqual({ start: at(8), end: at(17) });
  });
});
