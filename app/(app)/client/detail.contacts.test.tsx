/**
 * A client's profile for someone whose "Can see client phone numbers and emails" is off (web roles
 * plan A2, §5.6, UR21): the phone and email read "Hidden" with the tip, Call, Message and Email are
 * not offered, and the message log leaves out where each message went. Name, history and Edit stay.
 * An owner or admin, or anyone with the switch on, sees the details and the actions as before.
 *
 * jest hoists mock factories above imports, so closed-over vars are prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

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
jest.mock('@/components/bookings/BookingDetailSheet', () => ({ BookingDetailSheet: () => null }));
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
import { FULL_VIEWER_ACCESS, type ViewerAccess } from '@/lib/roles/roles';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';

const TIP = 'Your business has hidden client phone numbers and emails for you.';

function detail(guest: { email: string | null; phone: string | null }, extra: Record<string, unknown> = {}) {
  return {
    guest: {
      id: 'g1',
      first_name: 'Ada',
      last_name: 'Lovelace',
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
      ...guest,
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
    booking_history: [],
    communications: [
      {
        id: 'm1',
        message_type: 'booking_confirmation_email',
        channel: 'email',
        status: 'sent',
        created_at: '2026-10-01T09:00:00Z',
        booking_id: null,
        guest_id: 'g1',
        recipient: guest.email,
      },
    ],
    custom_field_definitions: [],
    ...extra,
  };
}

async function renderAs(access: ViewerAccess) {
  await render(
    <ViewerAccessProvider value={access}>
      <ClientDetailScreen />
    </ViewerAccessProvider>,
  );
}

const HIDDEN: ViewerAccess = { canSeeClientContact: false, canExportClients: true, otherDiaries: 'book' };

describe('Client detail with hidden contacts', () => {
  it('shows "Hidden" with the tip and offers no call, message or email', async () => {
    mockDetail = detail({ email: null, phone: null }, { contacts_hidden: true });
    await renderAs(HIDDEN);

    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.getByText(TIP)).toBeTruthy();
    expect(screen.queryByLabelText('Call')).toBeNull();
    expect(screen.queryByLabelText('Message')).toBeNull();
    expect(screen.queryByLabelText('Email')).toBeNull();
    // Editing the rest of the profile stays.
    expect(screen.getByLabelText('Edit')).toBeTruthy();
  });

  it('never shows a value cached from before the switch changed', async () => {
    mockDetail = detail({ email: 'ada@example.com', phone: '+447911123456' });
    await renderAs(HIDDEN);
    expect(screen.queryByText(/ada@example\.com/)).toBeNull();
    expect(screen.queryByLabelText('Call')).toBeNull();
  });

  it('reads the response flag even before the viewer is known', async () => {
    mockDetail = detail({ email: null, phone: null }, { contacts_hidden: true });
    await renderAs(FULL_VIEWER_ACCESS);
    expect(screen.getByText('Hidden')).toBeTruthy();
  });

  it('shows the details and the actions to someone who can see contacts', async () => {
    mockDetail = detail({ email: 'ada@example.com', phone: '+447911123456' });
    await renderAs(FULL_VIEWER_ACCESS);

    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.getByLabelText('Call')).toBeTruthy();
    expect(screen.getByLabelText('Message')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByText('To ada@example.com')).toBeTruthy();
  });
});
