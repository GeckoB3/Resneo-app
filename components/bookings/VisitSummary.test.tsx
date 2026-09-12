import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockMutate = jest.fn();
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useUpdateBookingStatus: () => ({ mutate: mockMutate, isPending: false }),
}));
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ error: jest.fn(), success: jest.fn(), info: jest.fn() }),
}));
jest.mock('@/lib/haptics', () => ({ hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticTap: jest.fn(), hapticSelect: jest.fn() }));

import { VisitSummary } from '@/components/bookings/VisitSummary';
import type { GroupVisitBookingRow } from '@/lib/queries/useGroupVisit';
import type { BookingDetail } from '@/types/booking-detail';

/**
 * The visit summary at the top of the booking panel (web #190): the facts staff
 * need at a glance. One row per service with its time, length, status and
 * price; the total; what is paid and owed.
 */
const base = (over: Partial<BookingDetail>): BookingDetail =>
  ({
    id: 'b1',
    status: 'Confirmed',
    booking_date: '2026-09-10',
    booking_time: '10:00',
    booking_end_time: '11:00',
    party_size: 1,
    guest_id: 'g1',
    service_item_id: 'svc',
    ...over,
  }) as BookingDetail;

const common = {
  visitLoading: false,
  isTable: false,
  dateLabel: 'Wed 10 Sep',
  practitionerName: 'Kate',
  lastVisitDate: null,
  badges: [],
  canChangeServiceStatus: true,
  detailHydrating: false,
};

describe('VisitSummary', () => {
  beforeEach(() => mockMutate.mockClear());

  /**
   * Found on a device (2026-09-12): after a modify save the panel is seeded from
   * the PATCH response, which carries the new service but not its money yet. The
   * total read "Not set" while `balance_due_pence` still held the PREVIOUS
   * service's figure — £55 owed on a £25 booking, in the same card.
   */
  describe('while the money is settling', () => {
    const shape = {
      headerStatus: 'Booked' as const,
      timeLabel: '10:00 – 10:45',
      durationMinutes: 45,
      serviceName: 'Blow Dry',
    };
    const changedService = base({
      service_variant_name: 'Blow Dry',
      // The new service's price has not arrived yet...
      booking_total_price_pence: null,
      service_variant_price_pence: null,
      // ...but the balance from the service it replaced is still in the payload.
      balance_due_pence: 5500,
    });

    it('says nothing it would have to take back', async () => {
      await render(
        <VisitSummary
          {...common}
          {...shape}
          detailHydrating
          booking={changedService}
          visit={null}
          visitRows={[]}
        />,
      );
      expect(screen.queryByText('Outstanding')).toBeNull();
      expect(screen.queryByText('£55.00')).toBeNull();
      expect(screen.queryByText('Not set')).toBeNull();
    });

    it('still names the total as unknown once the refetch has landed', async () => {
      await render(
        <VisitSummary {...common} {...shape} booking={changedService} visit={null} visitRows={[]} />,
      );
      expect(screen.getByText('Not set')).toBeTruthy();
      expect(screen.getByText('Outstanding')).toBeTruthy();
    });
  });

  it('lists a single service with its add-ons, the total and what is owed', async () => {
    await render(
      <VisitSummary
        {...common}
        booking={base({
          service_variant_price_pence: 4000,
          addons: [{ addon_id: 'a', addon_name_snapshot: 'Hot stones', price_pence_at_booking: 1000, duration_minutes_at_booking: 15 }],
          addons_total_price_pence: 1000,
          booking_total_price_pence: 5000,
          deposit_status: 'Paid',
          deposit_amount_pence: 1500,
          amount_paid_pence: 1500,
          balance_due_pence: 3500,
        })}
        visit={null}
        visitRows={[]}
        headerStatus="Confirmed"
        timeLabel="10:00 – 11:00"
        durationMinutes={60}
        serviceName="Massage"
        badges={[{ label: 'Deposit due £10.00', tone: 'warning' }]}
      />,
    );
    expect(screen.getByText('10:00 – 11:00')).toBeTruthy();
    expect(screen.getByText('1 hr · Wed 10 Sep · First visit')).toBeTruthy();
    expect(screen.getByText('Deposit due £10.00')).toBeTruthy();
    expect(screen.getByText('Massage')).toBeTruthy();
    expect(screen.getByText('1 hr · with Kate')).toBeTruthy();
    expect(screen.getByText(/Hot stones \(\+15 min\)/)).toBeTruthy();
    expect(screen.getByText('£40.00')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('£50.00')).toBeTruthy();
    expect(screen.getByText('Deposit paid')).toBeTruthy();
    expect(screen.getByText('Outstanding')).toBeTruthy();
    // No per-row Start on a single service: the actions bar has it.
    expect(screen.queryByText('Start')).toBeNull();
  });

  it('lists every service of a visit with its own price, status and Start', async () => {
    const rows: GroupVisitBookingRow[] = [
      { id: 'b1', booking_date: '2026-09-10', booking_time: '10:00', booking_end_time: '10:45', status: 'Confirmed', booking_item_name: 'Cut', calendar_name: 'Kate' },
      { id: 'b2', booking_date: '2026-09-10', booking_time: '10:45', booking_end_time: '11:30', status: 'Seated', booking_item_name: 'Colour', calendar_name: 'Kate' },
    ];
    await render(
      <VisitSummary
        {...common}
        booking={base({
          group_booking_id: 'g',
          visit_payment: {
            booking_count: 2,
            booking_ids: ['b1', 'b2'],
            total_pence: 9000,
            amount_paid_pence: 0,
            balance_due_pence: 9000,
            lines: [
              { booking_id: 'b1', name: 'Cut', total_pence: 3000 },
              { booking_id: 'b2', name: 'Colour', total_pence: 6000 },
            ],
          },
        })}
        visit={{ services: [], totalMinutes: 90, spansDays: false, spansCalendars: false } as never}
        visitRows={rows}
        headerStatus="Seated"
        timeLabel="10:00 – 11:30"
        durationMinutes={90}
        serviceName={null}
        lastVisitDate="2026-08-03"
      />,
    );
    expect(screen.getByText('1 hr 30 min · Wed 10 Sep · Last visit Mon 3 Aug')).toBeTruthy();
    expect(screen.getByText('Cut (this booking)')).toBeTruthy();
    expect(screen.getByText('10:00–10:45 · 45 min')).toBeTruthy();
    expect(screen.getByText('£30.00')).toBeTruthy();
    expect(screen.getByText('Colour')).toBeTruthy();
    expect(screen.getByText('£60.00')).toBeTruthy();
    expect(screen.getByText('Visit total')).toBeTruthy();
    expect(screen.getByText('£90.00')).toBeTruthy();

    // Start on the first service PATCHes that row only.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Start Cut'));
    });
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0]![0]).toBe('Seated');
    // The second is in progress: Complete and Undo start.
    expect(screen.getByLabelText('Complete Colour')).toBeTruthy();

    // Undo start returns that service to Confirmed, as the web does — not to
    // Booked, which would drop the guest's confirmation.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Undo start Colour'));
    });
    expect(mockMutate.mock.calls.at(-1)![0]).toBe('Confirmed');
  });

  it('shows time, status and money only for a table', async () => {
    await render(
      <VisitSummary
        {...common}
        booking={base({ service_item_id: undefined, booking_total_price_pence: 0 })}
        visit={null}
        visitRows={[]}
        headerStatus="Booked"
        isTable
        timeLabel="19:00 – 21:00"
        durationMinutes={120}
        serviceName={null}
      />,
    );
    expect(screen.getByText('19:00 – 21:00')).toBeTruthy();
    expect(screen.queryByText('Price not set')).toBeNull();
    expect(screen.queryByText('Total')).toBeNull();
  });
});
