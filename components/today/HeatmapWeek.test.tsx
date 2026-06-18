/**
 * HeatmapWeek (Domain 10) — pure fill-bucket mapping + render coverage.
 *
 * The bucket function is the load-bearing logic (mirrors the web `getHeatColor`
 * thresholds), so it gets exhaustive boundary coverage. A render test confirms
 * the card surfaces the % / covers cell labels, "Today", and the legend.
 */
import { render, screen } from '@testing-library/react-native';

import { HeatmapWeek, heatBucket } from '@/components/today/HeatmapWeek';
import type { DashboardHeatmapDay } from '@/types/dashboard';

describe('heatBucket — fill-percent → bucket (web getHeatColor parity)', () => {
  it('maps each band to the right bucket', () => {
    expect(heatBucket(0)).toBe('quiet');
    expect(heatBucket(5)).toBe('quiet');
    expect(heatBucket(9)).toBe('quiet');
    expect(heatBucket(10)).toBe('steady');
    expect(heatBucket(39)).toBe('steady');
    expect(heatBucket(40)).toBe('busy');
    expect(heatBucket(69)).toBe('busy');
    expect(heatBucket(70)).toBe('veryBusy');
    expect(heatBucket(89)).toBe('veryBusy');
    expect(heatBucket(90)).toBe('full');
    expect(heatBucket(100)).toBe('full');
    expect(heatBucket(140)).toBe('full');
  });

  it('treats null/undefined fill as quiet (web coerces null → 0)', () => {
    expect(heatBucket(null)).toBe('quiet');
    expect(heatBucket(undefined)).toBe('quiet');
  });
});

function day(partial: Partial<DashboardHeatmapDay> & { date: string }): DashboardHeatmapDay {
  return {
    day: 'Mon',
    daily_total_covers: 0,
    peak_in_house_covers: 0,
    concurrent_cap: null,
    fill_percent: null,
    ...partial,
  };
}

describe('HeatmapWeek — render', () => {
  it('renders nothing for an empty week', async () => {
    await render(<HeatmapWeek days={[]} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('shows fill % when capped, total covers when uncapped, and "—" when empty', async () => {
    const days: DashboardHeatmapDay[] = [
      day({ date: '2026-06-18', day: 'Thu', concurrent_cap: 40, fill_percent: 75, daily_total_covers: 30 }),
      day({ date: '2026-06-19', day: 'Fri', concurrent_cap: null, fill_percent: null, daily_total_covers: 12 }),
      day({ date: '2026-06-20', day: 'Sat', concurrent_cap: null, fill_percent: null, daily_total_covers: 0 }),
    ];
    await render(<HeatmapWeek days={days} />);

    // Day 0 is labelled "Today" (not its weekday).
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.queryByText('Thu')).toBeNull();
    // Capped day → "%"; uncapped with covers → number; uncapped empty → em-dash.
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    // Legend present.
    expect(screen.getByText('Quiet')).toBeTruthy();
    expect(screen.getByText('Full')).toBeTruthy();
  });
});
