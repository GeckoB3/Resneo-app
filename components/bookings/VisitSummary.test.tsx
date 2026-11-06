import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockMutate = jest.fn();
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useUpdateBookingStatus: () => ({ mutate: mockMutate, isPending: false }),
}));
const mockToastError = jest.fn();
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ error: mockToastError, success: jest.fn(), info: jest.fn() }),
}));
jest.mock('@/lib/haptics', () => ({ hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticTap: jest.fn(), hapticSelect: jest.fn() }));
let mockVisitDetail: unknown = null;
jest.mock('@/lib/queries/useVisitPartnerLines', () => {
  const actual = jest.requireActual<typeof import('@/lib/queries/useVisitPartnerLines')>('@/lib/queries/useVisitPartnerLines');
  return { ...actual, useVisitDetail: () => mockVisitDetail };
});

import { VisitSummary } from '@/components/bookings/VisitSummary';
import { ApiError } from '@/lib/api/client';
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
  guestHistory: { priorVisits: 0, lastVisitDate: null },
  badges: [],
  canChangeServiceStatus: true,
  detailHydrating: false,
};

describe('VisitSummary', () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockToastError.mockClear();
  });

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
    // "First visit" is the line under the guest's name; it is not repeated here.
    expect(screen.getByText('1 hr · Wed 10 Sep')).toBeTruthy();
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
        guestHistory={{ priorVisits: 2, lastVisitDate: '2026-08-03' }}
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

    // Nobody confirmed the visit, so Undo start returns that service to Booked
    // (web QA B-4): Confirmed would stamp a staff confirmation nobody gave.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Undo start Colour'));
    });
    expect(mockMutate.mock.calls.at(-1)![0]).toBe('Booked');
  });

  /**
   * View only and Hidden (roles plan §5.11): starting or completing one service follows that
   * service's calendar, so only the services on the person's own calendar keep their buttons.
   */
  it("offers Start only on the services on this person's own calendar", async () => {
    await render(
      <VisitSummary
        {...common}
        booking={base({ group_booking_id: 'g' })}
        visit={{ services: [], totalMinutes: 90, spansDays: false, spansCalendars: true } as never}
        visitRows={[
          { id: 'b1', booking_date: '2026-09-10', booking_time: '10:00', booking_end_time: '10:45', status: 'Confirmed', booking_item_name: 'Cut', calendar_id: 'mine' },
          { id: 'b2', booking_date: '2026-09-10', booking_time: '10:45', booking_end_time: '11:30', status: 'Confirmed', booking_item_name: 'Colour', calendar_id: 'theirs' },
        ]}
        canChangeRow={(row) => row.calendar_id === 'mine'}
        headerStatus="Confirmed"
        timeLabel="10:00 – 11:30"
        durationMinutes={90}
        serviceName={null}
      />,
    );
    expect(screen.getByLabelText('Start Cut')).toBeTruthy();
    expect(screen.queryByLabelText('Start Colour')).toBeNull();
  });

  describe('Undo start on one service of a visit (web QA B-4)', () => {
    const visitBooking = base({ group_booking_id: 'g' });
    const visit = { services: [], totalMinutes: 90, spansDays: false, spansCalendars: false } as never;
    const renderVisit = (started: Partial<GroupVisitBookingRow>) =>
      render(
        <VisitSummary
          {...common}
          booking={visitBooking}
          visit={visit}
          visitRows={[
            { id: 'b1', booking_date: '2026-09-10', booking_time: '10:00', booking_end_time: '10:45', status: 'Confirmed', booking_item_name: 'Cut' },
            { id: 'b2', booking_date: '2026-09-10', booking_time: '10:45', booking_end_time: '11:30', status: 'Seated', booking_item_name: 'Colour', ...started },
          ]}
          headerStatus="Seated"
          timeLabel="10:00 – 11:30"
          durationMinutes={90}
          serviceName={null}
        />,
      );

    it('goes back to Confirmed when staff had confirmed the service', async () => {
      await renderVisit({ staff_attendance_confirmed_at: '2026-09-09T18:00:00Z' });
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Undo start Colour'));
      });
      expect(mockMutate.mock.calls.at(-1)![0]).toBe('Confirmed');
    });

    it('goes back to Confirmed when the guest had confirmed from a reminder', async () => {
      await renderVisit({ guest_attendance_confirmed_at: '2026-09-09T18:00:00Z' });
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Undo start Colour'));
      });
      expect(mockMutate.mock.calls.at(-1)![0]).toBe('Confirmed');
    });

    it('shows the reason the server gives when the change is refused', async () => {
      mockMutate.mockImplementation((_status: string, options: { onError: (error: unknown) => void }) =>
        options.onError(new ApiError('You cannot undo this service yet.', 409)),
      );
      await renderVisit({});
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Undo start Colour'));
      });
      expect(mockToastError).toHaveBeenCalledWith('You cannot undo this service yet.');
    });

    it('falls back to a plain message when there is no reason to show', async () => {
      mockMutate.mockImplementation((_status: string, options: { onError: (error: unknown) => void }) =>
        options.onError(new Error('Network request failed')),
      );
      await renderVisit({});
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Undo start Colour'));
      });
      expect(mockToastError).toHaveBeenCalledWith('Could not update Colour.');
    });
  });

  /**
   * Seating a booking makes the server count it (web lifecycle.ts), so the
   * panel must not name the guest's "last visit" — it would be this one, dated
   * the day they were ticked in. The count behind this booking still shows.
   */
  it('names no date when the stored last visit is this booking', async () => {
    await render(
      <VisitSummary
        {...common}
        booking={base({})}
        visit={null}
        visitRows={[]}
        headerStatus="Seated"
        timeLabel="10:00 - 10:45"
        durationMinutes={45}
        serviceName="Blow Dry"
        guestHistory={{ priorVisits: 2, lastVisitDate: null }}
      />,
    );
    expect(screen.getByText('45 min · Wed 10 Sep · 2 previous visits')).toBeTruthy();
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

  /** An older server (web split-visit plan 7.3): the other business's services as bare lines. */
  it("lists another business's services read-only, never this business's own", async () => {
    mockVisitDetail = { legacy: true, parts: [], lines: [
      { booking_id: 'p1', linked_visit_id: 'lv-1', venue_id: 'v-nails', venue_name: 'SV Nails', booking_date: '2026-09-10', start_time: '10:45', end_time: '11:30', service_name: 'Gel Manicure', person_name: 'Bea', status: 'Booked' },
      { booking_id: 'p2', linked_visit_id: 'lv-1', venue_id: 'v-nails', venue_name: 'SV Nails', booking_date: '2026-09-10', start_time: '11:30', end_time: '12:00', service_name: 'Nail Art', person_name: null, status: 'Cancelled' },
      { booking_id: 'own', linked_visit_id: 'lv-1', venue_id: 'v-studio', venue_name: 'SV Studio', booking_date: '2026-09-10', start_time: '09:00', end_time: '10:00', service_name: 'Colour', person_name: 'Amy', status: 'Booked' },
    ] };
    await render(
      <VisitSummary
        {...common}
        booking={base({ linked_visit_id: 'lv-1', venue_id: 'v-studio' })}
        visit={null}
        visitRows={[]}
        headerStatus="Confirmed"
        timeLabel="10:00 – 11:00"
        durationMinutes={60}
        serviceName="Cut"
      />,
    );
    expect(screen.getByText('10:45 Gel Manicure with Bea, SV Nails, Booked')).toBeTruthy();
    expect(screen.queryByText(/Nail Art/)).toBeNull();
    expect(screen.queryByText(/Colour with Amy/)).toBeNull();
    expect(screen.queryByTestId('visit-money')).toBeNull();
    mockVisitDetail = null;
  });

  /**
   * A visit across businesses (owner, 2026-11-05): a Cut & Blow Dry with Aisha at Aura Hair Studio,
   * then a Root Tint with Andrew at Light 16. Each card shows the whole visit in time order, every
   * service's price, and each business's part with who takes the payment.
   */
  describe('a visit across businesses', () => {
    const lines = (ownVenue: string) => [
      { booking_id: 'aura-1', linked_visit_id: 'lv-x', venue_id: 'v-aura', venue_name: 'Aura Hair Studio', booking_date: '2026-11-07', start_time: '09:30', end_time: '10:30', service_name: 'Cut & Blow Dry', person_name: 'Aisha', status: 'Booked', own: ownVenue === 'v-aura', price_pence: 5500 },
      { booking_id: 'light-1', linked_visit_id: 'lv-x', venue_id: 'v-light', venue_name: 'Light 16', booking_date: '2026-11-07', start_time: '10:30', end_time: '10:50', service_name: 'Root Tint', person_name: 'Andrew', status: 'Booked', own: ownVenue === 'v-light', price_pence: 6500 },
    ];
    const parts = (ownVenue: string, auraPaid = 0) => [
      { venue_id: 'v-aura', venue_name: 'Aura Hair Studio', own: ownVenue === 'v-aura', total_pence: 5500, paid_pence: auraPaid, outstanding_pence: 5500 - auraPaid },
      { venue_id: 'v-light', venue_name: 'Light 16', own: ownVenue === 'v-light', total_pence: 6500, paid_pence: 0, outstanding_pence: 6500 },
    ];
    afterEach(() => {
      mockVisitDetail = null;
    });

    it('shows the whole visit and what each business takes, on its own booking', async () => {
      mockVisitDetail = { lines: lines('v-aura'), parts: parts('v-aura') };
      await render(
        <VisitSummary
          {...common}
          booking={base({ id: 'aura-1', venue_id: 'v-aura', linked_visit_id: 'lv-x', booking_date: '2026-11-07', booking_time: '09:30', booking_end_time: '10:30', booking_total_price_pence: 5500 })}
          visit={null}
          visitRows={[]}
          headerStatus="Booked"
          dateLabel="Sat 7 Nov"
          timeLabel="09:30 – 10:30"
          durationMinutes={60}
          serviceName="Cut & Blow Dry"
          practitionerName="Aisha"
        />,
      );
      // The header spans both businesses.
      expect(screen.getByText('09:30 – 10:50')).toBeTruthy();
      expect(screen.getByText('1 hr 20 min · Sat 7 Nov')).toBeTruthy();
      expect(screen.getByTestId('visit-business-opened')).toHaveTextContent('Aura Hair Studio (you)');
      // The other business's service, with its person, time, length and price.
      expect(screen.getByText('Root Tint')).toBeTruthy();
      expect(screen.getByText('10:30–10:50 · 20 min · with Andrew')).toBeTruthy();
      // On its row, as Light 16's part, and as what Light 16 still has to take.
      expect(screen.getAllByText('£65.00')).toHaveLength(3);
      // The money: the whole visit, then each part and who takes it.
      expect(screen.getByTestId('visit-whole-total')).toHaveTextContent('£120.00');
      expect(screen.getAllByText(/Yours to take|takes this payment/).map((n) => n.props.children)).toEqual([
        'Yours to take',
        'Light 16 takes this payment',
      ]);
    });

    it("lists the signed-in business's own services first when the partner's later booking is opened", async () => {
      mockVisitDetail = { lines: lines('v-aura'), parts: parts('v-aura', 5500) };
      await render(
        <VisitSummary
          {...common}
          booking={base({ id: 'light-1', venue_id: 'v-light', linked_visit_id: 'lv-x', booking_date: '2026-11-07', booking_time: '10:30', booking_end_time: '10:50', booking_total_price_pence: 6500 })}
          visit={null}
          visitRows={[]}
          headerStatus="Booked"
          dateLabel="Sat 7 Nov"
          timeLabel="10:30 – 10:50"
          durationMinutes={20}
          serviceName="Root Tint"
          practitionerName="Andrew"
        />,
      );
      expect(screen.getByText('09:30 – 10:50')).toBeTruthy();
      // Its section heading and its part in the money.
      expect(screen.getAllByText('Aura Hair Studio (you)')).toHaveLength(2);
      expect(screen.getByTestId('visit-business-opened')).toHaveTextContent('Light 16');
      expect(screen.getByText('09:30–10:30 · 1 hr · with Aisha')).toBeTruthy();
      expect(screen.getAllByText(/Yours to take|takes this payment/).map((n) => n.props.children)).toEqual([
        'Yours to take',
        'Light 16 takes this payment',
      ]);
      // What Aura has taken for its own part, and that nothing of it is still owed.
      expect(screen.getByText('Paid so far')).toBeTruthy();
      expect(screen.getByTestId('visit-whole-total')).toHaveTextContent('£120.00');
    });
  });
});
