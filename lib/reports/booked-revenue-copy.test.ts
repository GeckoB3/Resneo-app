/**
 * Port of the web's `booked-revenue-copy.test.ts` (QA A-3, 2026-09-23).
 */
import { countsOtherKinds, unpricedNote } from './booked-revenue-copy';

const cell = (booked: number, unpriced = 0) => ({
  booked_pence: 0,
  no_show_pence: 0,
  booked_count: booked,
  no_show_count: 0,
  unpriced_count: unpriced,
});

describe('unpricedNote', () => {
  it('keeps the services wording when only appointments are unpriced', () => {
    expect(unpricedNote({ appointment: cell(3, 2) }, 2)).toBe(
      '2 services have no price on the booking or in your service list, so they add nothing to these totals.',
    );
    // Older servers send no split: the same words.
    expect(unpricedNote(undefined, 1)).toBe(
      '1 service has no price on the booking or in your service list, so it adds nothing to these totals.',
    );
  });

  it('names class, event and resource bookings instead of calling them services', () => {
    expect(unpricedNote({ appointment: cell(4), class: cell(1, 1), resource: cell(2, 2) }, 3)).toBe(
      '1 class booking and 2 resource bookings have no price set, so they add nothing to these totals.',
    );
    expect(unpricedNote({ event: cell(1, 1) }, 1)).toBe(
      '1 event booking has no price set, so it adds nothing to these totals.',
    );
    expect(unpricedNote({ appointment: cell(2, 1), class: cell(1, 1) }, 2)).toBe(
      '1 service and 1 class booking have no price set, so they add nothing to these totals.',
    );
  });

  it('says nothing when everything is priced', () => {
    expect(unpricedNote({ class: cell(2) }, 0)).toBeNull();
  });
});

describe('countsOtherKinds', () => {
  it('is true only once a class, event or resource booking is counted', () => {
    expect(countsOtherKinds(undefined)).toBe(false);
    expect(countsOtherKinds({ appointment: cell(5) })).toBe(false);
    expect(countsOtherKinds({ appointment: cell(5), resource: cell(1) })).toBe(true);
  });
});
