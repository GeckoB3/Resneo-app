import {
  newBookingsChartLabel,
  newBookingsCsvRows,
  newBookingsFootnote,
  newBookingsPeriodLabel,
  newBookingsQuery,
  newBookingsRangeError,
} from '@/lib/reports/new-bookings';
import type { NewBookingsReport } from '@/types/reports';

describe('new bookings helpers (web new-bookings.ts)', () => {
  it('builds the query the route takes, preset or custom', () => {
    expect(newBookingsQuery({ kind: 'preset', preset: 'this_week' }, 'day')).toBe('grain=day&preset=this_week');
    expect(newBookingsQuery({ kind: 'custom', from: '2026-09-01', to: '2026-09-30' }, 'week')).toBe(
      'grain=week&from=2026-09-01&to=2026-09-30',
    );
  });

  it('refuses the ranges the server refuses, before asking', () => {
    const today = '2026-09-19';
    expect(newBookingsRangeError({ from: '2026-09-01', to: '2026-09-19' }, today)).toBeNull();
    expect(newBookingsRangeError({ from: '2026-09-20', to: '2026-09-21' }, today)).toMatch(/future/);
    expect(newBookingsRangeError({ from: '2026-09-10', to: '2026-09-01' }, today)).toMatch(/before the start/);
    expect(newBookingsRangeError({ from: '2025-01-01', to: '2026-09-19' }, today)).toMatch(/400 days/);
  });

  it('labels periods and axis ticks like the web', () => {
    expect(newBookingsPeriodLabel('2026-09-19', '2026-09-19', 'day')).toBe('19 Sep 2026');
    expect(newBookingsPeriodLabel('2026-09-14', '2026-09-20', 'week')).toBe('14 Sep 2026 to 20 Sep 2026');
    expect(newBookingsPeriodLabel('2026-09-01', '2026-09-30', 'month')).toBe('September 2026');
    expect(newBookingsChartLabel('2026-09-14', 'week')).toBe('w/c 14 Sep');
    expect(newBookingsChartLabel('2026-09-01', 'month')).toBe('Sep 26');
  });

  it('writes the footnote only when there is something to say', () => {
    expect(newBookingsFootnote({ total: 3, by_channel: { online: 3, team: 0, walk_in: 0, linked_venue: 0 }, cancelled: 0, awaiting_payment: 0 })).toBeNull();
    expect(newBookingsFootnote({ total: 3, by_channel: { online: 3, team: 0, walk_in: 0, linked_venue: 0 }, cancelled: 1, awaiting_payment: 2 })).toBe(
      '1 of these has since been cancelled. 2 more are waiting for a deposit or card, and will count once paid.',
    );
  });

  it('builds a CSV with a row per period and a total', () => {
    const report: NewBookingsReport = {
      from: '2026-09-18',
      to: '2026-09-19',
      grain: 'day',
      today: '2026-09-19',
      periods: [
        { period_start: '2026-09-18', period_end: '2026-09-18', total: 2, by_channel: { online: 1, team: 1, walk_in: 0, linked_venue: 0 }, cancelled: 0, awaiting_payment: 0 },
        { period_start: '2026-09-19', period_end: '2026-09-19', total: 1, by_channel: { online: 0, team: 0, walk_in: 1, linked_venue: 0 }, cancelled: 1, awaiting_payment: 0 },
      ],
      totals: { total: 3, by_channel: { online: 1, team: 1, walk_in: 1, linked_venue: 0 }, cancelled: 1, awaiting_payment: 0 },
    };
    const rows = newBookingsCsvRows(report);
    expect(rows[0]).toEqual(['Period', 'From', 'To', 'New bookings', 'Online', 'By your team', 'Walk-ins', 'By a linked venue', 'Since cancelled', 'Awaiting payment']);
    expect(rows[1]).toEqual(['18 Sep 2026', '2026-09-18', '2026-09-18', '2', '1', '1', '0', '0', '0', '0']);
    expect(rows[3]).toEqual(['Total', '2026-09-18', '2026-09-19', '3', '1', '1', '1', '0', '1', '0']);
  });
});
