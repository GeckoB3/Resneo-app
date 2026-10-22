/**
 * Other people's diaries on the booking detail (web roles plan A2 and A2b, §5.11, §7.3). For a
 * View only or Hidden person, an appointment on someone else's calendar opens as before but offers
 * nothing the server would refuse with DIARY_VIEW_ONLY: no status, attendance, Modify, Reschedule,
 * cancel, resend or money actions, and the booking's own notes read only. A short note says why.
 * Their own appointments, everyone on "Can book and change", and classes keep every action.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

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
jest.mock('@/lib/queries/useGroupVisit', () => ({ useGroupVisitBookings: () => ({ data: undefined }) }));
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
jest.mock('@/components/calendar/RescheduleSheet', () => ({ RescheduleSheet: () => null }));
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
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';
import type { ViewerAccess } from '@/lib/roles/roles';
import type { BookingDetail } from '@/types/booking-detail';

const NOTE = 'You can see this booking, but you can only change bookings on your own calendar.';
const VIEW_ONLY: ViewerAccess = {
  canSeeClientContact: true,
  canExportClients: true,
  otherDiaries: 'view',
  ownCalendarIds: ['cal_mine'],
};
const HIDDEN_DIARIES: ViewerAccess = { ...VIEW_ONLY, otherDiaries: 'hidden' };
const BOOK: ViewerAccess = { canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' };

function makeBooking(overrides: Partial<BookingDetail> = {}): BookingDetail {
  return {
    id: 'bk_1',
    status: 'Booked',
    booking_date: '2030-01-10',
    booking_time: '10:00',
    party_size: 1,
    guest_id: 'g_1',
    guest: { id: 'g_1', first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', phone: '+447700900123' },
    calendar_id: 'cal_theirs',
    appointment_service_id: 's_1',
    booking_model: 'unified_scheduling',
    communications: [],
    ...overrides,
  } as BookingDetail;
}

async function renderAs(access: ViewerAccess, booking: BookingDetail) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ViewerAccessProvider value={access}>{children}</ViewerAccessProvider>
  );
  await render(<BookingDetailContent booking={booking} isAppointmentVenue onStatusChange={jest.fn()} />, {
    wrapper,
  });
}

/** Opens the collapsed Notes card, whose section renders only once open. */
async function openNotes() {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Notes'));
  });
}

/** Opens the payments card when there is one, so its actions can be looked for. */
async function openPayments() {
  const card = screen.queryByLabelText('Payments & confirmation');
  if (!card) return;
  await act(async () => {
    fireEvent.press(card);
  });
}

function expectEditActions(present: boolean) {
  for (const label of ['Reschedule', 'Modify', 'Start', 'Cancel booking', 'Arrived', 'Confirm']) {
    if (present) expect({ label, shown: screen.queryByText(label) !== null }).toEqual({ label, shown: true });
    else expect({ label, shown: screen.queryByText(label) !== null }).toEqual({ label, shown: false });
  }
}

beforeEach(() => {
  mockNotesProps.length = 0;
  mockVisitSummaryProps.length = 0;
  mockGuestHistory = [];
});

describe("someone else's appointment, for a View only person", () => {
  it('says why, and offers no change, status, attendance or cancel', async () => {
    await renderAs(VIEW_ONLY, makeBooking());
    expect(screen.getByText(NOTE)).toBeTruthy();
    expectEditActions(false);
    await openPayments();
    expect(screen.queryByText('Resend confirmation')).toBeNull();
  });

  it('keeps the booking notes read only and the client notes editable', async () => {
    await renderAs(VIEW_ONLY, makeBooking());
    await openNotes();
    expect(mockNotesProps.at(-1)).toMatchObject({ bookingReadOnly: true, readOnly: false, customerReadOnly: false });
  });

  it("still lets them rebook the client (the form offers only their own calendars)", async () => {
    await renderAs(VIEW_ONLY, makeBooking());
    expect(screen.getByText('Rebook')).toBeTruthy();
  });

  it('hands the visit summary a per-service check', async () => {
    await renderAs(VIEW_ONLY, makeBooking());
    const canChangeRow = mockVisitSummaryProps.at(-1)?.canChangeRow as (row: object) => boolean;
    expect(canChangeRow({ calendar_id: 'cal_mine' })).toBe(true);
    expect(canChangeRow({ calendar_id: 'cal_theirs' })).toBe(false);
  });

  it('reads a legacy row by its practitioner', async () => {
    await renderAs(VIEW_ONLY, makeBooking({ calendar_id: null, practitioner_id: 'cal_theirs' }));
    expect(screen.getByText(NOTE)).toBeTruthy();
  });
});

describe('for a Hidden person', () => {
  it("treats someone else's appointment the same way", async () => {
    await renderAs(HIDDEN_DIARIES, makeBooking());
    expect(screen.getByText(NOTE)).toBeTruthy();
    expectEditActions(false);
  });

  it("lists the client's visit on someone else's calendar as date, service and who with, with no Rebook", async () => {
    mockGuestHistory = [
      {
        id: 'b-theirs',
        restricted: true,
        booking_date: '2026-03-02',
        booking_time: '',
        status: 'Completed',
        booking_model: 'unified_scheduling',
        kind_label: 'Appointment',
        detail_label: 'Colour',
        practitioner_name: 'Marcus',
        service_name: 'Colour',
      },
    ];
    await renderAs(HIDDEN_DIARIES, makeBooking({ calendar_id: 'cal_mine' }));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Guest history'));
    });
    expect(screen.getByText('Colour')).toBeTruthy();
    expect(screen.getByText('2026-03-02 · With Marcus')).toBeTruthy();
    // The only Rebook is the hero's quick action for this booking's client.
    expect(screen.getAllByText('Rebook')).toHaveLength(1);
  });
});

describe('everything stays as before', () => {
  it("on a View only person's own appointment", async () => {
    await renderAs(VIEW_ONLY, makeBooking({ calendar_id: 'cal_mine' }));
    expect(screen.queryByText(NOTE)).toBeNull();
    expectEditActions(true);
    await openPayments();
    expect(screen.getByText('Resend confirmation')).toBeTruthy();
    await openNotes();
    expect(mockNotesProps.at(-1)).toMatchObject({ bookingReadOnly: false });
  });

  it('for everyone on Can book and change, on anyone\'s calendar', async () => {
    await renderAs(BOOK, makeBooking());
    expect(screen.queryByText(NOTE)).toBeNull();
    expectEditActions(true);
    expect(mockVisitSummaryProps.at(-1)?.canChangeRow).toBeUndefined();
  });

  it("on a class, which View only does not cover, even on someone else's calendar", async () => {
    await renderAs(
      VIEW_ONLY,
      makeBooking({
        class_instance_id: 'ci_1',
        inferred_booking_model: 'class_session',
        appointment_service_id: null,
      }),
    );
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.getByText('Cancel booking')).toBeTruthy();
  });
});
