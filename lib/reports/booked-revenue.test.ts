import {
  bookedRevenueChartLabel,
  bookedRevenueCsvRows,
  bookedRevenueNetPence,
  bookedRevenuePeriodLabel,
  bookedRevenueQuery,
  bookedRevenueRangeError,
  bookedRevenueStepBase,
  shiftBookedRevenueRange,
} from '@/lib/reports/booked-revenue';
import type { BookedRevenueReport } from '@/types/reports';

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
