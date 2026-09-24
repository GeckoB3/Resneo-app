/**
 * KpiGrid wording (web QA A-2, 2026-09-23). On an appointments venue the server
 * counts appointments only, so the Confirmed tile reads "% of appointments" /
 * "No appointments today". The "Other booking types" grid (classes, events and
 * resources) keeps "bookings".
 */
import { render, screen } from '@testing-library/react-native';

import { KpiGrid } from './KpiGrid';
import type { DashboardTodayStats } from '@/types/dashboard';

function stats(partial: Partial<DashboardTodayStats> = {}): DashboardTodayStats {
  return {
    covers: 0,
    bookings: 4,
    confirmed: 3,
    pending: 0,
    seated: 0,
    revenue: 0,
    next_booking: { time: '14:00', party_size: 1 },
    peak_in_house_covers: 0,
    concurrent_cap: null,
    peak_fill_percent: null,
    covers_in_house_now: 0,
    arriving_within_30_min: 0,
    ...partial,
  };
}

describe('KpiGrid', () => {
  it('words the counts as appointments on an appointments venue', async () => {
    await render(<KpiGrid today={stats()} isAppointment countsAppointments />);
    expect(screen.getByText('75% of appointments')).toBeTruthy();
    expect(screen.getByText('next appointment')).toBeTruthy();
  });

  it('says "No appointments today" when there are none', async () => {
    await render(
      <KpiGrid today={stats({ bookings: 0, confirmed: 0, next_booking: null })} isAppointment countsAppointments />,
    );
    expect(screen.getByText('No appointments today')).toBeTruthy();
  });

  it('keeps "bookings" for the other booking types grid', async () => {
    await render(<KpiGrid today={stats()} isAppointment />);
    expect(screen.getByText('75% of bookings')).toBeTruthy();
    expect(screen.getByText('next booking')).toBeTruthy();
    expect(screen.queryByText(/appointment/)).toBeNull();
  });

  it('keeps "bookings" on a table venue', async () => {
    await render(<KpiGrid today={stats({ bookings: 0, confirmed: 0 })} isAppointment={false} />);
    expect(screen.getByText('No bookings today')).toBeTruthy();
  });
});
