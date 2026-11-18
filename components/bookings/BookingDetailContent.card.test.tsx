/**
 * The booking detail's Card section (card-on-file-plan §6.3): the pill and lines for each state,
 * "Card actions" opening the card sheet with the visit and whether a card can be added here, and
 * "Add card now" opening the desk screen for the booking's client. Older servers (a `card_hold`
 * without the card-on-file fields) still read in the new words.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('@/lib/queries/useVisitPartnerLines', () => ({ useVisitPartnerLines: () => new Map() }));
jest.mock('@/lib/queries/useCommunications', () => ({ useCommunicationPolicies: () => ({ data: undefined }) }));
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
/** The card sheet, standing in: records the target it was opened with, and offers "Add card now". */
const mockDepositTargets: unknown[] = [];
jest.mock('@/components/bookings/DepositSheet', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    DepositSheet: ({ target, onAddCard }: { target: unknown; onAddCard?: () => void }) => {
      if (!target) return null;
      mockDepositTargets.push(target);
      return React.createElement(Text, { onPress: onAddCard }, 'open card sheet');
    },
  };
});
jest.mock('@/components/bookings/BookingAddCardSheet', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    BookingAddCardSheet: (props: { guestId: string; bookingId: string; hasContact: boolean }) =>
      React.createElement(Text, null, `desk screen for ${props.guestId} ${props.bookingId} ${props.hasContact}`),
  };
});
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
import type { CardHoldSummary } from '@/lib/booking/card-hold';
import type { ViewerAccess } from '@/lib/roles/roles';
import type { BookingDetail } from '@/types/booking-detail';

const FULL: ViewerAccess = { canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' };

function hold(over: Partial<CardHoldSummary> = {}): CardHoldSummary {
  return {
    fee_pence: 1000,
    saved: false,
    charged_pence: null,
    charged_at: null,
    released_at: null,
    charge_failure_code: null,
    charge_window_ends_at: null,
    ...over,
  };
}

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
    deposit_status: 'Pending',
    ...overrides,
  } as BookingDetail;
}

async function renderBooking(booking: BookingDetail, isAdmin = true) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ViewerAccessProvider value={FULL}>{children}</ViewerAccessProvider>
  );
  await render(
    <BookingDetailContent booking={booking} isAppointmentVenue isAdmin={isAdmin} onStatusChange={jest.fn()} />,
    { wrapper },
  );
}

beforeEach(() => {
  mockDepositTargets.length = 0;
});

describe('the booking detail Card section', () => {
  it('Waiting for card: the lines, then Card actions with the visit and Add card now', async () => {
    await renderBooking(
      makeBooking({
        group_booking_id: 'visit-1',
        card_hold: hold({ state: 'awaiting', source: 'awaiting', card_state: 'waiting' }),
      }),
    );
    expect(screen.getAllByText('Waiting for card').length).toBeGreaterThan(0);
    expect(screen.getByText('Waiting for card. A card request was sent to the client.')).toBeTruthy();
    expect(screen.getByText('No-show fee up to £10.00.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Card actions'));
    const target = mockDepositTargets[mockDepositTargets.length - 1] as { visitId: string; canAddCard: boolean };
    expect(target.visitId).toBe('visit-1');
    expect(target.canAddCard).toBe(true);
    await fireEvent.press(screen.getByText('open card sheet'));
    expect(screen.getByText('desk screen for g_1 bk_1 true')).toBeTruthy();
  });

  it('a single booking charges as a visit of one', async () => {
    await renderBooking(makeBooking({ card_hold: hold({ state: 'awaiting' }) }));
    await fireEvent.press(screen.getByText('Card actions'));
    expect((mockDepositTargets[mockDepositTargets.length - 1] as { visitId: string }).visitId).toBe('bk_1');
  });

  it('Card not needed says the client can still add one', async () => {
    await renderBooking(
      makeBooking({
        deposit_status: 'Waived',
        card_hold: hold({ state: 'not_needed', request_waived_at: '2030-01-01T10:00:00Z' }),
      }),
    );
    expect(
      screen.getByText('Card not needed for this booking. The client can still add one before the appointment.'),
    ).toBeTruthy();
  });

  it('Protected: the card on file, how it was found, and an expiring card', async () => {
    await renderBooking(
      makeBooking({
        deposit_status: 'Card Held',
        card_hold: hold({
          saved: true,
          state: 'held',
          source: 'card_on_file',
          card: {
            kind: 'card_on_file',
            brand: 'mastercard',
            last4: '1111',
            exp_month: 1,
            exp_year: 2029,
            cardholder_name: 'A L',
            scope: 'business',
            status: 'active',
          },
          found_by_label: 'Saved by the client',
        }),
      }),
    );
    await fireEvent.press(screen.getByText('Payments & confirmation'));
    expect(
      screen.getByText('Protected by card on file. Mastercard ending 1111. No-show fee up to £10.00.'),
    ).toBeTruthy();
    expect(screen.getByText('Saved by the client.')).toBeTruthy();
    expect(
      screen.getByText('The card expires before this booking. The client has been asked to update it.'),
    ).toBeTruthy();
  });

  it('an older server (no card-on-file fields) still reads in the new words', async () => {
    await renderBooking(makeBooking({ status: 'Pending', card_hold: hold() }));
    expect(screen.getByText('Waiting for card. A card request was sent to the client.')).toBeTruthy();
    expect(screen.queryByText('Card request sent')).toBeNull();
  });

  it('offers no desk screen for a booking with no client record', async () => {
    await renderBooking(makeBooking({ guest_id: undefined, guest: null, card_hold: hold({ state: 'awaiting' }) }));
    await fireEvent.press(screen.getByText('Card actions'));
    expect((mockDepositTargets[mockDepositTargets.length - 1] as { canAddCard: boolean }).canAddCard).toBe(false);
  });
});
