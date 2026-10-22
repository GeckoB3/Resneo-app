/**
 * Hidden client contacts on the booking detail (web roles plan A2, §5.6, UR21). For someone whose
 * "Can see client phone numbers and emails" is off, the client's phone and email read "Hidden" with
 * the tip, and no call, email or message action is offered; the confirmation can still be resent,
 * since the server sends it to the address it holds. Everyone else sees the values and actions as
 * before. Rebook joins the new booking to the same client through `guestId` (the wizard sends it as
 * `guest_id`).
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
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('@/lib/analytics', () => ({ ANALYTICS_EVENTS: {}, track: jest.fn() }));
const mockWriteRebook = jest.fn((_payload: unknown) => Promise.resolve());
jest.mock('@/lib/rebook-bootstrap', () => ({
  writeRebookBootstrap: (payload: unknown) => mockWriteRebook(payload),
}));

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
jest.mock('@/lib/queries/useGuestDetail', () => ({ useGuestDetail: () => ({ data: undefined, isLoading: false }) }));
jest.mock('@/lib/queries/useGroupVisit', () => ({ useGroupVisitBookings: () => ({ data: undefined }) }));
jest.mock('@/lib/queries/useLinkedGuestHistory', () => ({ useLinkedGuestHistory: () => ({ data: undefined }) }));
jest.mock('@/lib/queries/useServicesManage', () => ({ useManagedServices: () => ({ data: undefined }) }));
jest.mock('@/lib/payments/usePendingCardClock', () => ({ usePendingCardClock: () => Date.now() }));

// The heavy children have suites of their own; here they render nothing.
jest.mock('@/components/bookings/BookingNotesSection', () => ({ BookingNotesSection: () => null }));
jest.mock('@/components/bookings/BookingPaymentHistory', () => ({ BookingPaymentHistory: () => null }));
jest.mock('@/components/bookings/BookingPriceSummary', () => ({ BookingPriceSummary: () => null }));
jest.mock('@/components/bookings/ComplianceCard', () => ({ ComplianceCard: () => null }));
jest.mock('@/components/bookings/DepositSheet', () => ({ DepositSheet: () => null }));
jest.mock('@/components/bookings/TakePaymentSheet', () => ({ TakePaymentSheet: () => null }));
jest.mock('@/components/bookings/GroupVisitCards', () => ({ GroupVisitCards: () => null }));
jest.mock('@/components/bookings/VisitSummary', () => ({ VisitSummary: () => null }));
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

const HIDDEN: ViewerAccess = { canSeeClientContact: false, canExportClients: true, otherDiaries: 'book' };
const FULL: ViewerAccess = { canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' };
const TIP = 'Your business has hidden client phone numbers and emails for you.';

function makeBooking(overrides: Partial<BookingDetail> = {}): BookingDetail {
  return {
    id: 'bk_1',
    status: 'Booked',
    booking_date: '2030-01-10',
    booking_time: '10:00',
    party_size: 1,
    guest_id: 'g_1',
    guest: { id: 'g_1', first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', phone: '+447700900123' },
    practitioner_id: 'p_1',
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

beforeEach(() => {
  mockPush.mockReset();
  mockWriteRebook.mockClear();
});

describe('the booking detail for someone whose client contacts are hidden', () => {
  it('reads "Hidden" with the tip, and offers no call or email', async () => {
    // The server sends the values as null and says so.
    await renderAs(
      HIDDEN,
      makeBooking({
        contacts_hidden: true,
        guest: { id: 'g_1', first_name: 'Ada', last_name: 'Lovelace', email: null, phone: null },
      }),
    );
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.getByText(TIP)).toBeTruthy();
    expect(screen.queryByText('Call')).toBeNull();
    expect(screen.queryByText('Email')).toBeNull();
    expect(screen.queryByLabelText('Call Ada Lovelace')).toBeNull();
  });

  it('never shows a value it still holds from before the switch changed', async () => {
    await renderAs(HIDDEN, makeBooking());
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.queryByText('ada@example.com')).toBeNull();
    expect(screen.queryByText('Call')).toBeNull();
  });

  it('reads "Hidden" when only the response says so (a switch changed since the app loaded you)', async () => {
    await renderAs(
      FULL,
      makeBooking({
        contacts_hidden: true,
        guest: { id: 'g_1', first_name: 'Ada', last_name: 'Lovelace', email: null, phone: null },
      }),
    );
    expect(screen.getByText('Hidden')).toBeTruthy();
  });

  it('still lets them resend the confirmation, and leaves out the message composer', async () => {
    await renderAs(HIDDEN, makeBooking({ contacts_hidden: true }));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Payments & confirmation'));
    });
    expect(screen.getByText('Resend confirmation')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('SMS / Email guest'));
    });
    expect(screen.queryByText('Send message')).toBeNull();
    expect(screen.queryByText('No email or phone on file. Add contact details to message this guest.')).toBeNull();
  });

  it('rebooks the same client by id', async () => {
    await renderAs(HIDDEN, makeBooking({ contacts_hidden: true }));
    await act(async () => {
      fireEvent.press(screen.getByText('Rebook'));
    });
    expect(mockWriteRebook).toHaveBeenCalledWith(
      expect.objectContaining({ guest: expect.objectContaining({ guestId: 'g_1' }) }),
    );
  });
});

describe('the booking detail for everyone else', () => {
  it('shows the phone and email with call and email actions', async () => {
    await renderAs(FULL, makeBooking());
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByText('Call')).toBeTruthy();
    expect(screen.getByText('Email')).toBeTruthy();
  });
});
