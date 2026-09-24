/**
 * Reports → Revenue once classes, events and rooms are priced (web QA A-3,
 * 2026-09-23; web `BookedRevenueSection.kinds.test.tsx`). The totals carry
 * `by_kind`; with any class, event or resource booking counted the tile reads
 * "Bookings counted", the no-show caption says "booking(s)", and the unpriced
 * note names each kind rather than calling them services.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

import type { BookedRevenueCell, BookedRevenueReport } from '@/types/reports';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

jest.mock('@/components/ui/DatePickerField', () => ({ DatePickerField: () => null }));

let mockReport: BookedRevenueReport | undefined;
jest.mock('@/lib/queries/useBookedRevenue', () => ({
  useBookedRevenue: () => ({
    data: mockReport,
    isFetching: false,
    isPlaceholderData: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/lib/reports/csv-export', () => ({
  buildAndShareCsv: jest.fn(async () => ({ ok: true })),
}));

import { BookedRevenueSection } from '@/components/reports/BookedRevenueSection';

function cell(partial: Partial<BookedRevenueCell> = {}): BookedRevenueCell {
  return {
    booked_pence: 0,
    no_show_pence: 0,
    booked_count: 0,
    no_show_count: 0,
    unpriced_count: 0,
    ...partial,
  };
}

function report(byKind: BookedRevenueReport['totals']['by_kind'], totals: Partial<BookedRevenueCell>) {
  const total = cell(totals);
  return {
    from: '2026-09-21',
    to: '2026-09-27',
    grain: 'day',
    today: '2026-09-23',
    columns: [
      { key: 'a', calendar_id: 'a', name: 'Hannah', venue_id: 'v', venue_name: 'Ours', linked: false, colour: null },
    ],
    periods: [
      { period_start: '2026-09-23', period_end: '2026-09-23', ...total, by_calendar: { a: total } },
    ],
    totals: { ...total, by_calendar: { a: total }, by_kind: byKind },
  } satisfies BookedRevenueReport;
}

describe('BookedRevenueSection: kinds of booking', () => {
  it('counts bookings, not appointments, and names the unpriced class', async () => {
    mockReport = report(
      {
        appointment: cell({ booked_pence: 4500, booked_count: 1 }),
        class: cell({ booked_count: 1, unpriced_count: 1 }),
      },
      { booked_pence: 4500, booked_count: 2, no_show_count: 1, no_show_pence: 1000, unpriced_count: 1 },
    );
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-23" />);

    expect(screen.getByText('Bookings counted')).toBeTruthy();
    expect(screen.queryByText('Appointments counted')).toBeNull();
    expect(screen.getByText('1 booking')).toBeTruthy();
    expect(
      screen.getByText('1 class booking has no price set, so it adds nothing to these totals.'),
    ).toBeTruthy();
    expect(screen.queryByText(/services have no price/)).toBeNull();
    expect(
      screen.getByText(/Classes, events and resource bookings count on the calendar they appear on/),
    ).toBeTruthy();
  });

  it('keeps the appointment wording when only appointments are counted', async () => {
    mockReport = report(
      { appointment: cell({ booked_pence: 4500, booked_count: 3, unpriced_count: 2 }) },
      { booked_pence: 4500, booked_count: 3, no_show_count: 2, no_show_pence: 1000, unpriced_count: 2 },
    );
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-23" />);

    expect(screen.getByText('Appointments counted')).toBeTruthy();
    expect(screen.getByText('2 services')).toBeTruthy();
    expect(
      screen.getByText(
        '2 services have no price on the booking or in your service list, so they add nothing to these totals.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Classes, events and resource bookings/)).toBeNull();
  });

  it('reads an older server with no split as appointments', async () => {
    mockReport = report(undefined, { booked_pence: 4500, booked_count: 1, unpriced_count: 1 });
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-23" />);

    expect(screen.getByText('Appointments counted')).toBeTruthy();
    expect(
      screen.getByText(
        '1 service has no price on the booking or in your service list, so it adds nothing to these totals.',
      ),
    ).toBeTruthy();
  });
});
