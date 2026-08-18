import type { OpeningHours } from '@/types/venue';

import {
  closedRangesFromOpenWindows,
  venueClosedRanges,
  resolveVenueDay,
  venueDayHours,
  type VenueWideBlock,
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

/**
 * Date overrides. The diary answered from the weekly template alone, so a venue
 * closure and a bank-holiday amendment were both invisible on it while the
 * booking engine enforced both.
 *
 * Order and precedence mirror web's `resolveVenueWideAllowedMinuteRanges`,
 * because the two must agree about which minutes exist.
 */
describe('resolveVenueDay', () => {
  const MONDAY = '2026-08-24';
  const weekly = { '1': { closed: false, periods: [{ open: '09:00', close: '17:00' }] } };

  function block(over: Partial<VenueWideBlock>): VenueWideBlock {
    return {
      id: 'b1',
      service_id: null,
      block_type: 'closed',
      date_start: MONDAY,
      date_end: MONDAY,
      ...over,
    };
  }

  it('falls back to the weekly shape when nothing covers the date', () => {
    expect(resolveVenueDay(weekly, MONDAY, [])).toEqual({
      hours: { kind: 'open', periods: [{ start: 540, end: 1020 }] },
      amendedRanges: [],
    });
  });

  it('shuts the day for a closure with no times', () => {
    expect(resolveVenueDay(weekly, MONDAY, [block({})]).hours).toEqual({ kind: 'closed' });
  });

  it('NARROWS the day for a part-day closure instead of shutting it', () => {
    // Web Stage 3 deleted the adapter that turned every closure into a full-day
    // one for appointments, so the times entered now mean what they say.
    const { hours } = resolveVenueDay(weekly, MONDAY, [
      block({ time_start: '12:00', time_end: '13:00' }),
    ]);
    expect(hours).toEqual({
      kind: 'open',
      periods: [
        { start: 540, end: 720 },
        { start: 780, end: 1020 },
      ],
    });
  });

  it('lets an Hours override REPLACE the weekly shape', () => {
    const { hours, amendedRanges } = resolveVenueDay(weekly, MONDAY, [
      block({ block_type: 'amended_hours', override_periods: [{ open: '10:00', close: '14:00' }] }),
    ]);
    expect(hours).toEqual({ kind: 'open', periods: [{ start: 600, end: 840 }] });
    expect(amendedRanges).toEqual([{ start: 600, end: 840 }]);
  });

  it('opens a weekly-CLOSED day when an override says so', () => {
    // The single most broken case in web's old resolver: it returned closed
    // before it ever looked at the amended hours.
    const closedSunday = { '0': { closed: true, periods: [] } };
    const { hours } = resolveVenueDay(closedSunday, '2026-08-23', [
      block({
        date_start: '2026-08-23',
        date_end: '2026-08-23',
        block_type: 'amended_hours',
        override_periods: [{ open: '11:00', close: '15:00' }],
      }),
    ]);
    expect(hours).toEqual({ kind: 'open', periods: [{ start: 660, end: 900 }] });
  });

  it('lets a closure beat an Hours override, and draws no amended band then', () => {
    // Telling an owner "closed" and "amended hours" about the same minutes
    // contradicts itself, so the band goes when the day resolves closed.
    const { hours, amendedRanges } = resolveVenueDay(weekly, MONDAY, [
      block({ id: 'a', block_type: 'amended_hours', override_periods: [{ open: '10:00', close: '14:00' }] }),
      block({ id: 'b' }),
    ]);
    expect(hours).toEqual({ kind: 'closed' });
    expect(amendedRanges).toEqual([]);
  });

  it('picks the most specific Hours override, not the union of all of them', () => {
    // A one-day 10:00–14:00 override nested inside a three-month 08:00–20:00 one
    // must NARROW that day; unioning them silently widened it.
    const { hours } = resolveVenueDay(weekly, MONDAY, [
      block({
        id: 'wide',
        block_type: 'amended_hours',
        date_start: '2026-07-01',
        date_end: '2026-09-30',
        override_periods: [{ open: '08:00', close: '20:00' }],
      }),
      block({
        id: 'narrow',
        block_type: 'amended_hours',
        override_periods: [{ open: '10:00', close: '14:00' }],
      }),
    ]);
    expect(hours).toEqual({ kind: 'open', periods: [{ start: 600, end: 840 }] });
  });

  it('applies a part-day closure at a venue with no opening hours at all', () => {
    // The commonest appointments shape. Without materialising the day first,
    // subtracting the closure is a silent no-op.
    const { hours } = resolveVenueDay(null, MONDAY, [
      block({ time_start: '12:00', time_end: '13:00' }),
    ]);
    expect(hours).toEqual({
      kind: 'open',
      periods: [
        { start: 0, end: 720 },
        { start: 780, end: 1440 },
      ],
    });
  });

  it('ignores service-scoped blocks — those are not venue-wide', () => {
    expect(resolveVenueDay(weekly, MONDAY, [block({ service_id: 'svc-1' })]).hours).toEqual({
      kind: 'open',
      periods: [{ start: 540, end: 1020 }],
    });
  });

  it('ignores an amended block carrying no usable period', () => {
    // Invalid data, not an intent to close (web §2.2, both layers).
    const { hours } = resolveVenueDay(weekly, MONDAY, [
      block({ block_type: 'amended_hours', override_periods: [] }),
    ]);
    expect(hours).toEqual({ kind: 'open', periods: [{ start: 540, end: 1020 }] });
  });
});
