import type { OpeningHours } from '@/types/venue';

import {
  closedRangesFromOpenWindows,
  venueClosedRanges,
  venueDayHours,
} from './venue-closures';

/** Opening hours that apply the same rule to every weekday (deterministic regardless of date). */
function everyDay(day: OpeningHours['0']): OpeningHours {
  return { '0': day, '1': day, '2': day, '3': day, '4': day, '5': day, '6': day };
}

const OPEN_9_5 = everyDay({ periods: [{ open: '09:00', close: '17:00' }] });
const CLOSED = everyDay({ closed: true });
const SPLIT = everyDay({ periods: [{ open: '09:00', close: '12:00' }, { open: '13:00', close: '17:00' }] });
const ANY_DATE = '2026-06-15';

describe('closedRangesFromOpenWindows', () => {
  it('returns the gaps before, between and after the open windows', () => {
    // grid 08:00–20:00 (480–1200), open 09:00–17:00 (540–1020)
    expect(closedRangesFromOpenWindows([{ start: 540, end: 1020 }], 480, 1200)).toEqual([
      { start: 480, end: 540 },
      { start: 1020, end: 1200 },
    ]);
  });

  it('returns the midday gap for a split shift', () => {
    expect(
      closedRangesFromOpenWindows([{ start: 540, end: 720 }, { start: 780, end: 1020 }], 540, 1020),
    ).toEqual([{ start: 720, end: 780 }]);
  });

  it('returns nothing when open spans the whole window', () => {
    expect(closedRangesFromOpenWindows([{ start: 480, end: 1200 }], 480, 1200)).toEqual([]);
  });

  it('returns the whole window when there are no open ranges', () => {
    expect(closedRangesFromOpenWindows([], 480, 1200)).toEqual([{ start: 480, end: 1200 }]);
  });

  it('is empty for a degenerate window', () => {
    expect(closedRangesFromOpenWindows([{ start: 540, end: 1020 }], 600, 600)).toEqual([]);
  });
});

describe('venueDayHours', () => {
  it('is unknown when there are no opening hours', () => {
    expect(venueDayHours(null, ANY_DATE)).toEqual({ kind: 'unknown' });
    expect(venueDayHours(undefined, ANY_DATE)).toEqual({ kind: 'unknown' });
  });

  it('is closed for a closed day', () => {
    expect(venueDayHours(CLOSED, ANY_DATE)).toEqual({ kind: 'closed' });
  });

  it('returns open periods in minutes', () => {
    expect(venueDayHours(OPEN_9_5, ANY_DATE)).toEqual({
      kind: 'open',
      periods: [{ start: 540, end: 1020 }],
    });
  });

  it('returns both periods of a split shift', () => {
    expect(venueDayHours(SPLIT, ANY_DATE)).toEqual({
      kind: 'open',
      periods: [{ start: 540, end: 720 }, { start: 780, end: 1020 }],
    });
  });

  it('is unknown for an open day with no usable periods', () => {
    expect(venueDayHours(everyDay({ periods: [] }), ANY_DATE)).toEqual({ kind: 'unknown' });
  });

  it('is unknown when the weekday has no entry', () => {
    expect(venueDayHours({ '1': { closed: true } }, ANY_DATE === '2026-06-15' ? '2026-06-14' : ANY_DATE))
      .toBeDefined(); // Sunday 2026-06-14 has no '0' entry → unknown
  });
});

describe('venueClosedRanges', () => {
  it('shades nothing when the day is unknown', () => {
    expect(venueClosedRanges({ kind: 'unknown' }, 480, 1200)).toEqual([]);
    expect(venueClosedRanges(undefined, 480, 1200)).toEqual([]);
  });

  it('shades the whole window when the venue is closed', () => {
    expect(venueClosedRanges({ kind: 'closed' }, 480, 1200)).toEqual([{ start: 480, end: 1200 }]);
  });

  it('shades the out-of-hours gaps when the venue is open', () => {
    expect(venueClosedRanges(venueDayHours(OPEN_9_5, ANY_DATE), 480, 1200)).toEqual([
      { start: 480, end: 540 },
      { start: 1020, end: 1200 },
    ]);
  });
});
