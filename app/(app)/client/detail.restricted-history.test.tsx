/**
 * A client's history for a person set to "Hidden" (web roles plan A2b, §5.11, UR20). A visit on
 * someone else's calendar arrives as `restricted: true` with only its date, service and who it was
 * with; the screen shows exactly that and the row does not open. Their own visits open as before.
 *
 * jest hoists mock factories above imports, so closed-over vars are prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'g1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    featureFlags: null,
    terminology: { client: 'Client', booking: 'Appointment' },
    venue: { id: 'venue-1', timezone: 'Europe/London' },
  }),
}));
jest.mock('@/lib/realtime/useVenueLiveSync', () => ({ useVenueLiveSync: () => 'idle' }));
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => ({ data: { staff: { role: 'staff' } } }) }));

let mockDetail: Record<string, unknown> = {};
jest.mock('@/lib/queries/useGuestDetail', () => ({
  useGuestDetail: () => ({
    data: mockDetail,
    isLoading: false,
    isError: false,
    isRefetching: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/lib/queries/useGuestMutations', () => ({
  useGuestTimeline: () => ({ data: { events: [] }, refetch: jest.fn() }),
  useSendGuestMessage: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateGuest: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

// The sections below the profile have their own tests and their own data.
// The booking sheet says which booking it was asked to open, if any.
jest.mock('@/components/bookings/BookingDetailSheet', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BookingDetailSheet: ({ bookingId }: { bookingId: string | null }) =>
      bookingId ? <Text>{`opened:${bookingId}`}</Text> : null,
  };
});
jest.mock('@/components/clients/ComplianceSection', () => ({ ComplianceSection: () => null }));
jest.mock('@/components/clients/CustomFieldsSection', () => ({ CustomFieldsSection: () => null }));
jest.mock('@/components/clients/DocumentsSection', () => ({ DocumentsSection: () => null }));
jest.mock('@/components/clients/GdprSection', () => ({ GdprSection: () => null }));
jest.mock('@/components/clients/GuestEditSheet', () => ({ GuestEditSheet: () => null }));
jest.mock('@/components/clients/GuestTagEditor', () => ({ GuestTagEditor: () => null }));
jest.mock('@/components/clients/HouseholdSection', () => ({ HouseholdSection: () => null }));
jest.mock('@/components/clients/MarketingPreferencesCard', () => ({ MarketingPreferencesCard: () => null }));
jest.mock('@/components/clients/MergeContactDetailSheet', () => ({ MergeContactDetailSheet: () => null }));
jest.mock('@/components/clients/ClientPurchasesSection', () => ({ ClientPurchasesSection: () => null }));
jest.mock('@/components/clients/LoyaltyCardSection', () => ({ LoyaltyCardSection: () => null }));
jest.mock('@/components/clients/StoredValueSection', () => ({ StoredValueSection: () => null }));
jest.mock('@/components/pos/SavedCards', () => ({ ClientSavedCardsSection: () => null }));
jest.mock('@/components/messaging/GuestMessageSheet', () => ({ GuestMessageSheet: () => null }));

import ClientDetailScreen from '@/app/(app)/client/[id]';
import type { ViewerAccess } from '@/lib/roles/roles';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';

const HIDDEN_DIARIES: ViewerAccess = {
  canSeeClientContact: true,
  canExportClients: true,
  otherDiaries: 'hidden',
  ownCalendarIds: ['cal-mine'],
};

function profile() {
  return {
    guest: {
      id: 'g1',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      phone: '+447911123456',
      tags: [],
      visit_count: 2,
      no_show_count: 0,
      last_visit_date: null,
      customer_profile_notes: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      marketing_opt_out: false,
      marketing_consent: false,
      marketing_consent_at: null,
      custom_fields: {},
      address_line1: null,
      address_line2: null,
      address_city: null,
      address_postcode: null,
    },
    stats: {
      total_bookings: 2,
      cancellations: 0,
      no_shows: 0,
      total_deposit_pence_paid: 0,
      first_visit_date: null,
      last_visit_date: null,
      days_since_last_visit: null,
      days_as_customer: 30,
    },
    booking_history: [
      // As useGuestDetail hands it on: the server's restricted row with the gaps filled.
      {
        id: 'b-theirs',
        restricted: true,
        booking_date: '2026-03-02',
        booking_time: '',
        party_size: null,
        status: 'Completed',
        deposit_status: null,
        deposit_amount_pence: null,
        booking_model: 'unified_scheduling',
        kind_label: 'Appointment',
        detail_label: 'Colour',
        practitioner_name: 'Marcus',
        service_name: 'Colour',
        area_name: null,
      },
      {
        id: 'b-mine',
        booking_date: '2026-03-01',
        booking_time: '10:00:00',
        party_size: 1,
        status: 'Completed',
        deposit_status: null,
        deposit_amount_pence: null,
        booking_model: 'unified_scheduling',
        kind_label: 'Appointment',
        detail_label: 'Cut with Sam',
        practitioner_name: 'Sam',
        service_name: 'Cut',
        area_name: null,
        calendar_id: 'cal-mine',
      },
    ],
    communications: [],
    custom_field_definitions: [],
  };
}

async function openHistory() {
  await render(
    <ViewerAccessProvider value={HIDDEN_DIARIES}>
      <ClientDetailScreen />
    </ViewerAccessProvider>,
  );
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Guest bookings'));
  });
}

describe("a client's history for a Hidden person", () => {
  it("shows someone else's visit as its date, service and who it was with", async () => {
    mockDetail = profile();
    await openHistory();
    expect(screen.getByText('Colour')).toBeTruthy();
    expect(screen.getByText('With Marcus')).toBeTruthy();
    // Nothing else of it: the only kind line is their own visit's.
    expect(screen.getAllByText(/^Appointment/)).toHaveLength(1);
  });

  it('does not open it', async () => {
    mockDetail = profile();
    await openHistory();
    await act(async () => {
      fireEvent.press(screen.getByText('Colour'));
    });
    expect(screen.queryByText('opened:b-theirs')).toBeNull();
  });

  it('still opens their own visit', async () => {
    mockDetail = profile();
    await openHistory();
    await act(async () => {
      fireEvent.press(screen.getByText('Cut with Sam'));
    });
    expect(screen.getByText('opened:b-mine')).toBeTruthy();
  });
});
