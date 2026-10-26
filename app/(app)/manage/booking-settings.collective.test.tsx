/**
 * Booking settings in a live collective (web Docs/collective-booking-settings-plan.md §7.5).
 *
 * The collective decides sign-in, self-reschedule, the waitlist, "Any available" and staff-first for
 * every venue in it. A member sees them read-only with "{host} sets this for {collective}." (the
 * owner's case: a member used to see its own staff-first switch, off, while the page had it on); the
 * host's change is saved for every venue. Appointments are shown locked up front.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
  };
});
jest.mock('@/components/payments/InPersonPayments', () => ({ BookingSettingsPayments: () => null }));
jest.mock('@/components/treatment-records/TreatmentRecordsSwitchCard', () => ({ TreatmentRecordsSwitchCard: () => null }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

const mockUpdateFlagsAsync = jest.fn((patch?: unknown) => Promise.resolve({ resolved: patch, raw: patch }));
const mockUpdateVenueAsync = jest.fn((_patch?: unknown) => Promise.resolve({}));
let mockIsHost = false;
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useFeatureFlags: () => ({
    data: {
      calendars: [
        { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Hana', venue_name: 'Host Venue' },
        { id: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'Zoe', venue_name: 'Zen Studio' },
      ],
      any_available_practitioner_config: { mode: 'priority', calendar_order: [] },
      collective: {
        id: 'col-1',
        name: 'Northside',
        public_name: 'Northside Hair',
        host_venue_name: 'Host Venue',
        is_host: mockIsHost,
        controls: ['staff_first_booking_flow', 'require_account_login'],
        version: 3,
      },
    },
    isLoading: false,
  }),
  useUpdateFeatureFlags: () => ({ mutateAsync: mockUpdateFlagsAsync, isPending: false }),
  useUpdateVenue: () => ({ mutateAsync: mockUpdateVenueAsync, isPending: false }),
}));

// The collective's values, as the server serves them to every venue in it.
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: {
      id: 'venue-1',
      name: 'Zen Studio',
      current_user_role: 'admin',
      pricing_tier: 'plus',
      booking_model: 'unified_scheduling',
      active_booking_models: ['unified_scheduling'],
      require_account_login_for_bookings: true,
      feature_flags: {
        resolved: { staff_first_booking_flow: true, any_available_practitioner: true },
        raw: { staff_first_booking_flow: true, any_available_practitioner: true },
      },
    },
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

import BookingSettingsScreen from '@/app/(app)/manage/booking-settings';

beforeEach(() => {
  mockUpdateFlagsAsync.mockClear();
  mockUpdateVenueAsync.mockClear();
  mockToast.success.mockClear();
});

describe('Booking settings for a member of a live collective', () => {
  beforeEach(() => {
    mockIsHost = false;
  });

  it("shows the collective's values read-only and says who sets them", async () => {
    await render(<BookingSettingsScreen />);
    expect(
      screen.getByText(
        "You're part of Northside, hosted by Host Venue. Your clients book on the Northside page. Host Venue sets the settings marked Northside.",
      ),
    ).toBeTruthy();
    const staffFirst = screen.getByLabelText('Staff-first booking');
    expect(staffFirst.props.value).toBe(true);
    expect(staffFirst.props.disabled).toBe(true);
    expect(screen.getAllByText('Host Venue sets this for Northside.').length).toBeGreaterThanOrEqual(4);
    await act(async () => {
      fireEvent(staffFirst, 'valueChange', false);
    });
    expect(mockUpdateFlagsAsync).not.toHaveBeenCalled();
  });

  it('shows sign-in read-only, and the priority list with every venue', async () => {
    await render(<BookingSettingsScreen />);
    const signIn = screen.getByLabelText('Require sign-in to book');
    expect(signIn.props.value).toBe(true);
    expect(signIn.props.disabled).toBe(true);
    expect(screen.getByText(/1\. Hana at Host Venue/)).toBeTruthy();
    expect(screen.getByText(/2\. Zoe at Zen Studio/)).toBeTruthy();
  });

  it('shows appointments locked up front', async () => {
    await render(<BookingSettingsScreen />);
    expect(screen.getByLabelText('Enable Appointments & services').props.disabled).toBe(true);
    expect(
      screen.getByText(
        'You cannot switch appointments off while Zen Studio is in a collective, because the collective page needs them.',
      ),
    ).toBeTruthy();
  });
});

describe('Booking settings for the host of a live collective', () => {
  beforeEach(() => {
    mockIsHost = true;
  });

  it('saves a change for every venue and says so', async () => {
    await render(<BookingSettingsScreen />);
    expect(
      screen.getByText(
        'You host Northside. Settings marked Northside apply to the Northside page and to online bookings at every venue in it.',
      ),
    ).toBeTruthy();
    const staffFirst = screen.getByLabelText('Staff-first booking');
    expect(staffFirst.props.disabled).toBe(false);
    await act(async () => {
      fireEvent(staffFirst, 'valueChange', false);
    });
    expect(mockUpdateFlagsAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdateFlagsAsync.mock.calls[0][0]).toEqual(expect.objectContaining({ staff_first_booking_flow: false }));
    expect(await screen.findByText('Saved for Northside.')).toBeTruthy();
  });
});
