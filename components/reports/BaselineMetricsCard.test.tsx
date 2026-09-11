import { render, screen } from '@testing-library/react-native';

import { BaselineMetricsCard } from '@/components/reports/BaselineMetricsCard';
import type { BaselineMetricsSnapshot, VenueBaselineMetrics } from '@/types/reports';

/**
 * Report 8 — the copy is the web's, including the day a reference period was
 * saved and the full detail line under each figure
 * (`_reference/Resneo/src/app/dashboard/reports/BaselineMetricsSection.tsx`).
 */

function metrics(overrides: Partial<VenueBaselineMetrics> = {}): VenueBaselineMetrics {
  return {
    period: { from: '2026-09-01', to: '2026-09-30' },
    scope: 'appointments',
    no_show: { no_show_count: 0, eligible_count: 0, rate_pct: 0 },
    reschedule: {
      modifications_count: 0,
      modification_notifications_count: 0,
      reschedule_via_email_rate_pct: 0,
      guest_self_reschedule_count: 0,
      staff_reschedule_count: 0,
      unknown_actor_reschedule_count: 0,
      guest_self_reschedule_rate_pct: 0,
    },
    cancellation_rebook: {
      cancellations_with_guest: 0,
      rebooked_within_7d: 0,
      rebooked_within_30d: 0,
      rebook_rate_7d_pct: 0,
      rebook_rate_30d_pct: 0,
      median_rebook_gap_hours: null,
      p75_rebook_gap_hours: null,
    },
    staff_time_to_book: {
      sample_count: 0,
      median_duration_ms: null,
      p75_duration_ms: null,
      returning_guest: { sample_count: 0, median_duration_ms: null },
    },
    computed_at: '2026-09-30T12:00:00.000Z',
    ...overrides,
  };
}

const SNAPSHOT: BaselineMetricsSnapshot = {
  period_start: '2026-06-01',
  period_end: '2026-06-30',
  snapshot_kind: 'weekly',
  created_at: '2026-09-05T09:00:00.000Z',
  metrics: metrics(),
};

describe('BaselineMetricsCard', () => {
  it('says when the reference period was saved, and what the figures follow', async () => {
    await render(<BaselineMetricsCard metrics={metrics()} snapshot={SNAPSHOT} />);
    const savedOn = new Date(SNAPSHOT.created_at).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    expect(screen.getAllByText(/Reference period saved:/).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        new RegExp(
          `\\(saved ${savedOn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\. Figures below follow the date range you selected at the top of Reports\\.`,
        ),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('keeps the web’s full detail lines', async () => {
    await render(
      <BaselineMetricsCard
        metrics={metrics({
          no_show: { no_show_count: 2, eligible_count: 10, rate_pct: 20 },
          reschedule: {
            modifications_count: 4,
            modification_notifications_count: 0,
            reschedule_via_email_rate_pct: 0,
            guest_self_reschedule_count: 1,
            staff_reschedule_count: 2,
            unknown_actor_reschedule_count: 1,
            guest_self_reschedule_rate_pct: 33,
          },
        })}
        snapshot={null}
      />,
    );
    expect(
      screen.getByText(
        '2 guests did not arrive out of 10 appointments that were due to take place (walk-ins excluded).',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Among 3 where we know who moved it: 1 by the guest online, 2 by your team\./)).toBeTruthy();
    expect(
      screen.getByText(
        /None of the 4 moves triggered an automatic email or text to the guest\. Staff moves often send an update when configured in Settings\./,
      ),
    ).toBeTruthy();
    expect(screen.getByText('Guest moved online (share of known moves)')).toBeTruthy();
    expect(screen.getByText('Median time to create an appointment')).toBeTruthy();
    expect(screen.getByText(/A saved reference snapshot \(updated weekly\)/)).toBeTruthy();
  });

  it('explains an empty range the way the web does', async () => {
    await render(<BaselineMetricsCard metrics={null} />);
    expect(
      screen.getByText(
        /Not enough appointment activity in this date range yet\. Widen the range at the top of Reports or check back after more bookings are created\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Attendance, reschedules, cancellations, and how quickly your team adds bookings, for the date range selected above\./,
      ),
    ).toBeTruthy();
  });
});
