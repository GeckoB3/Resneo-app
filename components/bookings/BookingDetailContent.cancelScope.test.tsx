/**
 * Cancelling one service of a visit (split-visit plan 7.7, G17; web `ExpandedBookingContent`
 * `cancelScope`). Cancel on a service of a visit with more than one live service with this
 * business asks: "Cancel just Brow Wax, or every service Ada Lovelace has with you on this
 * visit?", with "Cancel this service" and "Cancel all with us". An ordinary booking keeps the
 * two-tap confirm.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

/** The other businesses' services of a visit across businesses (web split-visit plan 7.7). */
let mockPartnerLines: Map<string, unknown[]> = new Map();
jest.mock('@/lib/queries/useVisitPartnerLines', () => ({ useVisitPartnerLines: () => mockPartnerLines }));
/** The business's message settings, as GET /api/venue/communication-policies answers (web QA BKG-B-F13). */
let mockPolicies: unknown = undefined;
jest.mock('@/lib/queries/useCommunications', () => ({ useCommunicationPolicies: () => ({ data: mockPolicies }) }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/lib/analytics', () => ({ ANALYTICS_EVENTS: {}, track: jest.fn() }));
jest.mock('@/lib/rebook-bootstrap', () => ({ writeRebookBootstrap: jest.fn(() => Promise.resolve()) }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: { timezone: 'Europe/London', currency: 'GBP', current_user_role: 'staff' },
    featureFlags: null,
  }),
}));
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useDeleteBooking: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  useResendConfirmation: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  useSetBookingAttendance: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  useSendBookingMessage: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  useSendDepositPaymentLinkById: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
}));
let mockGuestHistory: unknown[] = [];
jest.mock('@/lib/queries/useGuestDetail', () => ({
  useGuestDetail: () => ({ data: { guest: null, booking_history: mockGuestHistory }, isLoading: false }),
}));
let mockVisitRows: unknown[] | undefined;
jest.mock('@/lib/queries/useGroupVisit', () => ({ useGroupVisitBookings: () => ({ data: mockVisitRows }) }));
jest.mock('@/lib/queries/useLinkedGuestHistory', () => ({ useLinkedGuestHistory: () => ({ data: undefined }) }));
jest.mock('@/lib/queries/useServicesManage', () => ({ useManagedServices: () => ({ data: undefined }) }));
jest.mock('@/lib/payments/usePendingCardClock', () => ({ usePendingCardClock: () => Date.now() }));

// The heavy children have suites of their own. Two record what they were handed.
const mockNotesProps: Record<string, unknown>[] = [];
jest.mock('@/components/bookings/BookingNotesSection', () => ({
  BookingNotesSection: (props: Record<string, unknown>) => {
    mockNotesProps.push(props);
    return null;
  },
}));
const mockVisitSummaryProps: Record<string, unknown>[] = [];
jest.mock('@/components/bookings/VisitSummary', () => ({
  VisitSummary: (props: Record<string, unknown>) => {
    mockVisitSummaryProps.push(props);
    return null;
  },
}));
jest.mock('@/components/bookings/BookingPaymentHistory', () => ({ BookingPaymentHistory: () => null }));
jest.mock('@/components/bookings/BookingPriceSummary', () => ({ BookingPriceSummary: () => null }));
jest.mock('@/components/bookings/ComplianceCard', () => ({ ComplianceCard: () => null }));
jest.mock('@/components/bookings/DepositSheet', () => ({ DepositSheet: () => null }));
jest.mock('@/components/bookings/TakePaymentSheet', () => ({ TakePaymentSheet: () => null }));
jest.mock('@/components/bookings/GroupVisitCards', () => ({ GroupVisitCards: () => null }));
jest.mock('@/components/bookings/ModifyBookingSheet', () => ({ ModifyBookingSheet: () => null }));
let mockRescheduleProps: { onMoved?: () => void } | null = null;
jest.mock('@/components/calendar/RescheduleSheet', () => ({
  RescheduleSheet: (props: { onMoved?: () => void }) => {
    mockRescheduleProps = props;
    return null;
  },
}));
jest.mock('@/components/bookings/ClassSessionMoveSheet', () => ({ ClassSessionMoveSheet: () => null }));
jest.mock('@/components/bookings/ResourceMoveSheet', () => ({ ResourceMoveSheet: () => null }));
jest.mock('@/components/clients/DocumentsSection', () => ({ DocumentsSection: () => null }));
jest.mock('@/components/linked/LinkedComplianceSection', () => ({ LinkedComplianceSection: () => null }));
jest.mock('@/components/pos/PosCheckoutButton', () => ({ PosCheckoutButton: () => null }));
jest.mock('@/components/retail/UseStockButton', () => ({ UseStockButton: () => null }));
jest.mock('@/components/bookings/AcceptUnpaidSheet', () => ({
  useAcceptUnpaidGuard: () => ({ intercept: () => false, sheet: null }),
}));

import { BookingDetailContent } from '@/components/bookings/BookingDetailContent';
import type { BookingDetail } from '@/types/booking-detail';

function makeBooking(overrides: Partial<BookingDetail> = {}): BookingDetail {
  return {
    id: 'bk_brow',
    status: 'Booked',
    booking_date: '2030-01-10',
    booking_time: '10:45',
    party_size: 1,
    guest_id: 'g_1',
    guest: { id: 'g_1', first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', phone: '+447700900123' },
    calendar_id: 'cal_1',
    appointment_service_id: 's_brow',
    service_name_snapshot: 'Brow Wax',
    booking_model: 'unified_scheduling',
    group_booking_id: 'grp_1',
    communications: [],
    ...overrides,
  } as BookingDetail;
}

function visitRow(id: string, time: string, end: string, status = 'Booked', name = 'Service') {
  return {
    id,
    booking_date: '2030-01-10',
    booking_time: time,
    booking_end_time: end,
    status,
    group_booking_id: 'grp_1',
    booking_item_name: name,
    calendar_id: 'cal_1',
  };
}

async function renderDetail(onStatusChange = jest.fn(), overrides: Partial<BookingDetail> = {}) {
  await render(
    <BookingDetailContent booking={makeBooking(overrides)} isAppointmentVenue onStatusChange={onStatusChange} />,
  );
  return onStatusChange;
}

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

const QUESTION = 'Cancel just Brow Wax, or every service Ada Lovelace has with you on this visit?';

describe('BookingDetailContent: cancelling one service of a visit (G17)', () => {
  beforeEach(() => {
    mockVisitRows = [
      visitRow('bk_cut', '10:00', '10:45', 'Booked', 'Cut'),
      visitRow('bk_brow', '10:45', '11:00', 'Booked', 'Brow Wax'),
    ];
  });

  it('asks which, and cancels just this service when asked', async () => {
    const onStatusChange = await renderDetail();
    await press('Cancel booking');

    expect(screen.getByText(QUESTION)).toBeTruthy();
    expect(onStatusChange).not.toHaveBeenCalled();

    await press('Cancel this service');
    expect(onStatusChange).toHaveBeenCalledWith('Cancelled', { cancelScope: 'service' });
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it('cancels every service with this business on "Cancel all with us"', async () => {
    const onStatusChange = await renderDetail();
    await press('Cancel booking');
    await press('Cancel all with us');
    expect(onStatusChange).toHaveBeenCalledWith('Cancelled', undefined);
  });

  it('cancels nothing when staff keep the booking', async () => {
    const onStatusChange = await renderDetail();
    await press('Cancel booking');
    await press('Keep the booking');
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it('does not ask when the rest of the visit is already over or cancelled', async () => {
    mockVisitRows = [
      visitRow('bk_cut', '10:00', '10:45', 'Completed', 'Cut'),
      visitRow('bk_brow', '10:45', '11:00', 'Booked', 'Brow Wax'),
      visitRow('bk_mani', '11:00', '11:30', 'Cancelled', 'Manicure'),
    ];
    const onStatusChange = await renderDetail();
    await press('Cancel booking');
    expect(screen.queryByText(QUESTION)).toBeNull();
    // The ordinary two-tap confirm.
    await press('Tap to confirm');
    expect(onStatusChange).toHaveBeenCalledWith('Cancelled');
  });
});

describe('BookingDetailContent: cancelling your part of a visit across businesses (7.7, D9)', () => {
  // Until the setting is known, nothing is promised (web QA BKG-B-F13).
  const KEEPS = 'Ada Lovelace keeps Gel Manicure with Bea at SV Nails. Make sure they know what is cancelled and what stays.';
  const line = (over: Record<string, unknown>) => ({
    booking_id: 'bk_gel',
    linked_visit_id: 'lv_1',
    venue_id: 'v_nails',
    venue_name: 'SV Nails',
    booking_date: '2030-01-10',
    start_time: '11:00',
    end_time: '11:30',
    service_name: 'Gel Manicure',
    person_name: 'Bea',
    status: 'Booked',
    ...over,
  });

  beforeEach(() => {
    mockVisitRows = [
      visitRow('bk_cut', '10:00', '10:45', 'Booked', 'Cut'),
      visitRow('bk_brow', '10:45', '11:00', 'Booked', 'Brow Wax'),
    ];
    mockPartnerLines = new Map([
      [
        'lv_1',
        [
          line({}),
          // Already cancelled at SV Nails, and this business's own row: neither is "kept".
          line({ booking_id: 'bk_pedi', service_name: 'Pedicure', status: 'Cancelled' }),
          line({ booking_id: 'bk_cut', venue_id: 'v_studio', venue_name: 'SV Studio', service_name: 'Cut' }),
        ],
      ],
    ]);
  });

  afterEach(() => {
    mockPartnerLines = new Map();
  });

  it("says what the client keeps at the other businesses beside the choice", async () => {
    await renderDetail(jest.fn(), { linked_visit_id: 'lv_1', venue_id: 'v_studio' });
    expect(screen.queryByText(KEEPS)).toBeNull();
    await press('Cancel booking');
    expect(screen.getByText(QUESTION)).toBeTruthy();
    expect(screen.getByText(KEEPS)).toBeTruthy();
  });

  it('says it on the two-tap confirm too, when this business has one service', async () => {
    mockVisitRows = [visitRow('bk_brow', '10:45', '11:00', 'Booked', 'Brow Wax')];
    const onStatusChange = await renderDetail(jest.fn(), { linked_visit_id: 'lv_1', venue_id: 'v_studio' });
    await press('Cancel booking');
    expect(screen.getByText(KEEPS)).toBeTruthy();
    await press('Tap to confirm');
    expect(onStatusChange).toHaveBeenCalledWith('Cancelled');
  });

  it("says the client is not told when the business's cancellation message is off (web QA BKG-B-F13)", async () => {
    mockPolicies = { appointments_other: { cancellation_confirmation: { enabled: false, channels: ['email'] } } };
    try {
      await renderDetail(jest.fn(), { linked_visit_id: 'lv_1', venue_id: 'v_studio' });
      await press('Cancel booking');
      expect(
        screen.getByText(
          'Ada Lovelace keeps Gel Manicure with Bea at SV Nails. Cancellation messages are switched off, so tell them yourself.',
        ),
      ).toBeTruthy();
    } finally {
      mockPolicies = undefined;
    }
  });

  it('says nothing for a visit within one business', async () => {
    await renderDetail(jest.fn(), { linked_visit_id: null, venue_id: 'v_studio' });
    await press('Cancel booking');
    expect(screen.queryByTestId('cancel-keeps-other-parts')).toBeNull();
  });
});

describe('BookingDetailContent reschedule feedback (found 2026-11-04)', () => {
  it('says the appointment moved once the reschedule sheet saves', async () => {
    await renderDetail();
    mockToast.success.mockClear();
    mockRescheduleProps?.onMoved?.();
    expect(mockToast.success).toHaveBeenCalledWith('Appointment moved.');
  });
});
