/**
 * R17-2. The rule that decides whether a diary block is a wall or advice, and
 * the range arithmetic that gives a break its amber note.
 */
import {
  isNonWorkingBlock,
  isOccupyingBlock,
  narrowWorkingRanges,
} from '@/lib/calendar/occupying-blocks';

describe('isOccupyingBlock', () => {
  it.each(['break', 'closed', 'amended_hours'])(
    'lets staff place over %s (the app grid vocabulary)',
    (type) => {
      expect(isOccupyingBlock(type)).toBe(false);
    },
  );

  it.each(['venue_closed', 'venue_amended_hours', 'practitioner_closed'])(
    'lets staff place over %s (web computed vocabulary)',
    (type) => {
      expect(isOccupyingBlock(type)).toBe(false);
    },
  );

  it.each(['manual', 'class_session', 'practitioner_leave', 'linked_venue_closed'])(
    'keeps %s a hard conflict',
    (type) => {
      expect(isOccupyingBlock(type)).toBe(true);
    },
  );

  it('occupies for an unrecognised type, so anything added later is refused first', () => {
    expect(isOccupyingBlock('something_new')).toBe(true);
    expect(isOccupyingBlock(undefined)).toBe(true);
    expect(isOccupyingBlock(null)).toBe(true);
    expect(isOccupyingBlock('')).toBe(true);
  });
});

describe('isNonWorkingBlock', () => {
  it.each(['break', 'closed', 'venue_closed', 'practitioner_closed'])(
    'flags %s as not normally worked (amber)',
    (type) => {
      expect(isNonWorkingBlock(type)).toBe(true);
    },
  );

  it.each(['amended_hours', 'venue_amended_hours'])(
    'does NOT flag %s — a specially opened window is the most inside-hours a slot gets',
    (type) => {
      expect(isNonWorkingBlock(type)).toBe(false);
    },
  );

  it('does not flag occupying blocks, which never reach the amber question', () => {
    expect(isNonWorkingBlock('manual')).toBe(false);
    expect(isNonWorkingBlock('class_session')).toBe(false);
  });
});

describe('narrowWorkingRanges', () => {
  const nineToFive = [{ start: 540, end: 1020 }];

  it('returns the working ranges untouched when nothing is cut', () => {
    expect(narrowWorkingRanges(nineToFive, [])).toEqual(nineToFive);
  });

  it('splits a working range around a midday break', () => {
    expect(narrowWorkingRanges(nineToFive, [{ start: 720, end: 780 }])).toEqual([
      { start: 540, end: 720 },
      { start: 780, end: 1020 },
    ]);
  });

  it('trims the head when the cut reaches the start', () => {
    expect(narrowWorkingRanges(nineToFive, [{ start: 480, end: 600 }])).toEqual([
      { start: 600, end: 1020 },
    ]);
  });

  it('trims the tail when the cut reaches the end', () => {
    expect(narrowWorkingRanges(nineToFive, [{ start: 960, end: 1080 }])).toEqual([
      { start: 540, end: 960 },
    ]);
  });

  it('removes a working range the cut swallows whole', () => {
    expect(narrowWorkingRanges(nineToFive, [{ start: 400, end: 1200 }])).toEqual([]);
  });

  it('leaves a non-overlapping cut alone', () => {
    expect(narrowWorkingRanges(nineToFive, [{ start: 1100, end: 1200 }])).toEqual(nineToFive);
  });

  it('applies several cuts in turn', () => {
    expect(
      narrowWorkingRanges(nineToFive, [
        { start: 720, end: 780 },
        { start: 900, end: 930 },
      ]),
    ).toEqual([
      { start: 540, end: 720 },
      { start: 780, end: 900 },
      { start: 930, end: 1020 },
    ]);
  });

  it('ignores a degenerate cut', () => {
    expect(narrowWorkingRanges(nineToFive, [{ start: 700, end: 700 }])).toEqual(nineToFive);
  });

  it('does not mutate its inputs', () => {
    const working = [{ start: 540, end: 1020 }];
    narrowWorkingRanges(working, [{ start: 720, end: 780 }]);
    expect(working).toEqual([{ start: 540, end: 1020 }]);
  });
});
