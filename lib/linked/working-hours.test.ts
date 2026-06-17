import { hasAnyWorkingHours, openRangesForDate } from '@/lib/linked/working-hours';

// A fixed date + its local weekday, so the key-lookup test is robust regardless
// of which day 2026-06-15 actually falls on in the runner's locale.
const DATE = '2026-06-15';
const WEEKDAY = new Date(2026, 5, 15).getDay();
const NAME = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][WEEKDAY]!;
const OTHER = String((WEEKDAY + 1) % 7);

describe('openRangesForDate', () => {
  it('reads the numeric weekday key and converts HH:mm to minutes', () => {
    const wh = { [String(WEEKDAY)]: [{ start: '09:00', end: '17:00' }] };
    expect(openRangesForDate(wh, DATE)).toEqual([{ start: 540, end: 1020 }]);
  });

  it('falls back to the legacy day-name key', () => {
    const wh = { [NAME]: [{ start: '09:00', end: '12:30' }] };
    expect(openRangesForDate(wh, DATE)).toEqual([{ start: 540, end: 750 }]);
  });

  it('returns every period for a split day', () => {
    const wh = {
      [String(WEEKDAY)]: [
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '17:00' },
      ],
    };
    expect(openRangesForDate(wh, DATE)).toEqual([
      { start: 540, end: 720 },
      { start: 780, end: 1020 },
    ]);
  });

  it('tolerates the {open,close} spelling', () => {
    const wh = { [String(WEEKDAY)]: [{ open: '08:00', close: '16:00' }] };
    expect(openRangesForDate(wh, DATE)).toEqual([{ start: 480, end: 960 }]);
  });

  it('returns [] for a day with no entry (closed)', () => {
    const wh = { [OTHER]: [{ start: '09:00', end: '17:00' }] };
    expect(openRangesForDate(wh, DATE)).toEqual([]);
  });

  it('drops zero-length / inverted ranges and malformed entries', () => {
    const wh = {
      [String(WEEKDAY)]: [
        { start: '09:00', end: '09:00' }, // zero-length
        { start: '17:00', end: '09:00' }, // inverted
        { start: '10:00' }, // missing end
        null,
        'nope',
        { start: '11:00', end: '12:00' }, // the one valid range
      ],
    };
    expect(openRangesForDate(wh, DATE)).toEqual([{ start: 660, end: 720 }]);
  });

  it('returns [] for null / non-object / malformed date', () => {
    expect(openRangesForDate(null, DATE)).toEqual([]);
    expect(openRangesForDate(undefined, DATE)).toEqual([]);
    expect(openRangesForDate('nope', DATE)).toEqual([]);
    expect(openRangesForDate({ [String(WEEKDAY)]: [{ start: '09:00', end: '17:00' }] }, 'bad')).toEqual(
      [],
    );
  });
});

describe('hasAnyWorkingHours', () => {
  it('is true when any weekday publishes hours', () => {
    expect(hasAnyWorkingHours({ '0': [], '1': [{ start: '09:00', end: '17:00' }] })).toBe(true);
  });

  it('is false for an all-empty template, null, or a non-object', () => {
    expect(hasAnyWorkingHours({ '0': [], '1': [] })).toBe(false);
    expect(hasAnyWorkingHours(null)).toBe(false);
    expect(hasAnyWorkingHours('nope')).toBe(false);
  });
});
