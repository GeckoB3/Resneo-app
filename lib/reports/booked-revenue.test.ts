import {
  bookedRevenueChartLabel,
  bookedRevenueCollectiveNetPence,
  bookedRevenueCollectiveNote,
  bookedRevenueCsvFilename,
  bookedRevenueCsvRows,
  bookedRevenueLinkedVenueNames,
  bookedRevenueNetPence,
  bookedRevenuePeriodLabel,
  bookedRevenueQuery,
  bookedRevenueRangeError,
  bookedRevenueStepBase,
  listVenueNames,
  shiftBookedRevenueRange,
  showBookedRevenueVenues,
} from '@/lib/reports/booked-revenue';
import type { BookedRevenueReport, BookedRevenueVenueCell } from '@/types/reports';

/**
 * Reports → Revenue (web #191). The server aggregates; these pin what the app
 * asks for and how it reads the answer back, so the two agree on every figure.
 */

const cell = (booked: number, noShow = 0) => ({
  booked_pence: booked,
  no_show_pence: noShow,
  booked_count: booked > 0 ? 1 : 0,
  no_show_count: noShow > 0 ? 1 : 0,
  unpriced_count: 0,
});

const report: BookedRevenueReport = {
  from: '2026-09-07',
  to: '2026-09-08',
  grain: 'day',
  today: '2026-09-08',
  columns: [
    { key: 'a', calendar_id: 'a', name: 'Hannah', venue_id: 'v', venue_name: 'Ours', linked: false, colour: null },
    { key: 'b', calendar_id: 'b', name: 'Jenny', venue_id: 'p', venue_name: 'Partner', linked: true, colour: null },
  ],
  periods: [
    {
      period_start: '2026-09-07',
      period_end: '2026-09-07',
      ...cell(5000, 1500),
      by_calendar: { a: cell(5000, 1500) },
    },
    {
      period_start: '2026-09-08',
      period_end: '2026-09-08',
      ...cell(2000),
      by_calendar: { b: cell(2000) },
    },
  ],
  totals: { ...cell(7000, 1500), by_calendar: { a: cell(5000, 1500), b: cell(2000) } },
};

describe('bookedRevenueQuery', () => {
  it('sends a preset as the preset, and a custom range as its dates', () => {
    expect(bookedRevenueQuery({ kind: 'preset', preset: 'this_week' }, 'day')).toBe('grain=day&preset=this_week');
    expect(bookedRevenueQuery({ kind: 'custom', from: '2026-09-01', to: '2026-09-30' }, 'month')).toBe(
      'grain=month&from=2026-09-01&to=2026-09-30',
    );
  });

  it('asks for one calendar with calendar_id, and for the whole venue without it', () => {
    expect(bookedRevenueQuery({ kind: 'preset', preset: 'this_week' }, 'day', 'cal-1')).toBe(
      'grain=day&preset=this_week&calendar_id=cal-1',
    );
    expect(bookedRevenueQuery({ kind: 'preset', preset: 'this_week' }, 'day', null)).toBe('grain=day&preset=this_week');
  });
});

describe('labels', () => {
  it('sizes the period label to the grain', () => {
    expect(bookedRevenuePeriodLabel('2026-09-07', '2026-09-07', 'day')).toBe('Mon 7 Sept');
    expect(bookedRevenuePeriodLabel('2026-09-07', '2026-09-13', 'week')).toBe('7 Sept to 13 Sept 2026');
    expect(bookedRevenuePeriodLabel('2026-09-01', '2026-09-30', 'month')).toBe('September 2026');
    expect(bookedRevenuePeriodLabel('2026-09-01', '2026-09-08', 'month')).toBe('1 Sept to 8 Sept 2026');
  });

  it('keeps the chart label short', () => {
    expect(bookedRevenueChartLabel('2026-09-07', 'day')).toBe('7 Sept');
    expect(bookedRevenueChartLabel('2026-09-01', 'month')).toBe('Sept 26');
  });
});

describe('shiftBookedRevenueRange', () => {
  it('steps a day, a week, or a calendar month, keeping the range length', () => {
    expect(shiftBookedRevenueRange({ from: '2026-09-11', to: '2026-09-11' }, 'day', 1)).toEqual({
      from: '2026-09-12',
      to: '2026-09-12',
    });
    expect(shiftBookedRevenueRange({ from: '2026-09-07', to: '2026-09-13' }, 'day', -1)).toEqual({
      from: '2026-09-06',
      to: '2026-09-12',
    });
    expect(shiftBookedRevenueRange({ from: '2026-09-07', to: '2026-09-13' }, 'week', 1)).toEqual({
      from: '2026-09-14',
      to: '2026-09-20',
    });
  });

  it('walks whole months to whole months, and clamps a partial range to the shorter month', () => {
    expect(shiftBookedRevenueRange({ from: '2026-09-01', to: '2026-09-30' }, 'month', 1)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(shiftBookedRevenueRange({ from: '2026-01-01', to: '2026-02-28' }, 'month', -1)).toEqual({
      from: '2025-12-01',
      to: '2026-01-31',
    });
    expect(shiftBookedRevenueRange({ from: '2026-01-31', to: '2026-03-02' }, 'month', 1)).toEqual({
      from: '2026-02-28',
      to: '2026-04-02',
    });
  });
});

describe('bookedRevenueRangeError', () => {
  it('passes a range the route would serve', () => {
    expect(bookedRevenueRangeError({ from: '2026-09-01', to: '2026-09-30' })).toBeNull();
    // 400 days exactly is the longest the route serves.
    expect(bookedRevenueRangeError({ from: '2026-01-01', to: '2027-02-05' })).toBeNull();
  });

  it('gives the route’s own words for a range it would refuse', () => {
    expect(bookedRevenueRangeError({ from: '2026-09-10', to: '2026-09-09' })).toBe(
      'The end date must not be before the start date.',
    );
    expect(bookedRevenueRangeError({ from: '2026-01-01', to: '2027-02-06' })).toBe(
      'Choose a range of up to 400 days.',
    );
    // A date the route could not parse is refused rather than sent.
    expect(bookedRevenueRangeError({ from: '2026-09-09', to: 'not-a-date' })).toBe(
      'Choose a range of up to 400 days.',
    );
  });
});

describe('bookedRevenueStepBase', () => {
  const answer = { from: '2026-09-07', to: '2026-09-13' };

  it('steps a custom choice from its own dates, whatever is still on screen', () => {
    expect(
      bookedRevenueStepBase({ kind: 'custom', from: '2026-09-08', to: '2026-09-14' }, answer, false),
    ).toEqual({ from: '2026-09-08', to: '2026-09-14' });
    // Even while that request is in flight and the previous answer is showing.
    expect(
      bookedRevenueStepBase({ kind: 'custom', from: '2026-09-08', to: '2026-09-14' }, answer, true),
    ).toEqual({ from: '2026-09-08', to: '2026-09-14' });
  });

  it('waits for a preset to resolve before it has anything to step from', () => {
    const preset = { kind: 'preset', preset: 'this_week' } as const;
    expect(bookedRevenueStepBase(preset, undefined, false)).toBeNull();
    expect(bookedRevenueStepBase(preset, answer, true)).toBeNull();
    expect(bookedRevenueStepBase(preset, answer, false)).toEqual(answer);
  });
});

describe('net and CSV', () => {
  it('adds no-shows back only when asked', () => {
    expect(bookedRevenueNetPence(report.totals, false)).toBe(7000);
    expect(bookedRevenueNetPence(report.totals, true)).toBe(8500);
    expect(bookedRevenueNetPence(undefined, true)).toBe(0);
  });

  it('exports the web CSV: a column per calendar (linked ones with their venue), a total, the no-shows', () => {
    const rows = bookedRevenueCsvRows(report, false);
    expect(rows[0]).toEqual(['Period', 'Hannah', 'Jenny (Partner)', 'Total', 'No-shows']);
    expect(rows[1]).toEqual(['Mon 7 Sept', '50.00', '0.00', '50.00', '15.00']);
    expect(rows[3]).toEqual(['Total', '50.00', '20.00', '70.00', '15.00']);
    expect(bookedRevenueCsvRows(report, true)[3]).toEqual(['Total', '65.00', '20.00', '85.00', '15.00']);
  });
});

/** A venue's subtotal with the part booked through the collective's page. */
function venueCell(booked: number, noShow: number, collectiveBooked: number, collectiveNoShow = 0): BookedRevenueVenueCell {
  return {
    booked_pence: booked,
    no_show_pence: noShow,
    booked_count: booked > 0 ? 2 : 0,
    no_show_count: noShow > 0 ? 1 : 0,
    unpriced_count: 0,
    collective_booked_pence: collectiveBooked,
    collective_no_show_pence: collectiveNoShow,
    collective_count: collectiveBooked > 0 ? 1 : 0,
  };
}

/** Ours, a collective member and a linked venue (web `buildBookedRevenueReport`). */
const collectiveReport: BookedRevenueReport = {
  ...report,
  venues: [
    { venue_id: 'v', venue_name: 'Ours', access: 'own' },
    { venue_id: 'm', venue_name: 'Member Studio', access: 'collective' },
    { venue_id: 'p', venue_name: 'Partner', access: 'link' },
  ],
  collective: { id: 'col', name: 'Aura Collective' },
  totals: {
    ...report.totals,
    by_venue: {
      v: venueCell(5000, 1500, 1000, 500),
      m: venueCell(3000, 0, 3000),
      p: venueCell(2000, 0, 0),
    },
  },
};

describe('the venue breakdown (web, collectives D49)', () => {
  it('shows with more than one venue or a collective, and not for an older server', () => {
    expect(showBookedRevenueVenues(collectiveReport)).toBe(true);
    expect(showBookedRevenueVenues({ venues: [{ venue_id: 'v', venue_name: 'Ours', access: 'own' }], collective: { id: 'c', name: 'C' } })).toBe(true);
    expect(showBookedRevenueVenues({ venues: [{ venue_id: 'v', venue_name: 'Ours', access: 'own' }], collective: null })).toBe(false);
    expect(showBookedRevenueVenues(report)).toBe(false);
  });

  it('names collective members as members, with the web words', () => {
    expect(bookedRevenueCollectiveNote(collectiveReport)).toBe(
      "Includes Member Studio, which is part of Aura Collective with you. Every venue in a collective sees each venue's booked revenue, venue by venue.",
    );
    const two = {
      ...collectiveReport,
      venues: [...collectiveReport.venues!, { venue_id: 'n', venue_name: 'North', access: 'collective' as const }],
    };
    expect(bookedRevenueCollectiveNote(two)).toBe(
      "Includes Member Studio and North, which are part of Aura Collective with you. Every venue in a collective sees each venue's booked revenue, venue by venue.",
    );
    expect(bookedRevenueCollectiveNote(report)).toBeNull();
  });

  it('keeps collective members out of the linked-account names', () => {
    expect(bookedRevenueLinkedVenueNames(collectiveReport)).toEqual({ names: ['Partner'], fromColumns: false });
    // An older server with no venue list: the linked columns' venues.
    expect(bookedRevenueLinkedVenueNames(report)).toEqual({ names: ['Partner'], fromColumns: true });
    // A collective with no links: no linked note.
    expect(
      bookedRevenueLinkedVenueNames({ ...collectiveReport, venues: collectiveReport.venues!.filter((v) => v.access !== 'link') }),
    ).toEqual({ names: [], fromColumns: false });
  });

  it('lists names as the web does', () => {
    expect(listVenueNames(['A'])).toBe('A');
    expect(listVenueNames(['A', 'B'])).toBe('A and B');
    expect(listVenueNames(['A', 'B', 'C'])).toBe('A, B and C');
    expect(listVenueNames([])).toBe('');
  });

  it("adds the collective's no-shows to its part only when they are counted", () => {
    const cellV = collectiveReport.totals.by_venue!.v;
    expect(bookedRevenueCollectiveNetPence(cellV, false)).toBe(1000);
    expect(bookedRevenueCollectiveNetPence(cellV, true)).toBe(1500);
    expect(bookedRevenueCollectiveNetPence(undefined, true)).toBe(0);
  });

  it('exports the venue breakdown after the totals, as the web CSV does', () => {
    const rows = bookedRevenueCsvRows(collectiveReport, false);
    expect(rows[3]).toEqual(['Total', '50.00', '20.00', '70.00', '15.00']);
    expect(rows.slice(4)).toEqual([
      [],
      ['Venue', 'Booked revenue', 'Through Aura Collective'],
      ['Ours', '50.00', '10.00'],
      ['Member Studio', '30.00', '30.00'],
      ['Partner', '20.00', '0.00'],
    ]);
    // With no-shows counted, each venue and its collective part include theirs.
    expect(bookedRevenueCsvRows(collectiveReport, true)[6]).toEqual(['Ours', '65.00', '15.00']);
  });

  it('names the column "Through a collective page" when linked venues are split without a collective', () => {
    const linkedOnly: BookedRevenueReport = {
      ...collectiveReport,
      collective: null,
      venues: collectiveReport.venues!.filter((v) => v.access !== 'collective'),
    };
    expect(bookedRevenueCsvRows(linkedOnly, false).slice(4, 6)).toEqual([[], ['Venue', 'Booked revenue', 'Through a collective page']]);
  });

  it('adds nothing for an older server with no venue list', () => {
    expect(bookedRevenueCsvRows(report, false)).toHaveLength(4);
  });
});

describe('one calendar (web 90ff4d17)', () => {
  const jess = { name: 'Jess' };

  it('has no venue breakdown: one calendar is one column of your own', () => {
    expect(showBookedRevenueVenues(collectiveReport, jess)).toBe(false);
    expect(showBookedRevenueVenues(collectiveReport, null)).toBe(true);
  });

  it("starts the CSV with the calendar, leaves the venues out, and names it in the file", () => {
    const rows = bookedRevenueCsvRows(collectiveReport, false, jess);
    expect(rows.slice(0, 3)).toEqual([['Showing Jess only'], [], ['Period', 'Hannah', 'Jenny (Partner)', 'Total', 'No-shows']]);
    expect(rows.some((row) => row[0] === 'Venue')).toBe(false);
    expect(bookedRevenueCsvFilename(collectiveReport, jess)).toBe('booked-revenue-jess-2026-09-07-2026-09-08-day.csv');
    expect(bookedRevenueCsvFilename(collectiveReport)).toBe('booked-revenue-2026-09-07-2026-09-08-day.csv');
  });
});
