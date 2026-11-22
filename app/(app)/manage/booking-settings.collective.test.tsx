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
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
}));
/** Render Sheet children inline (avoids gesture-handler/Modal): the change-for-everyone question. */
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
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
const mockRefetchFlags = jest.fn();
const mockRefetchVenue = jest.fn();
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useFeatureFlags: () => ({
    refetch: mockRefetchFlags,
    data: {
      calendars: [
        { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Hana', venue_name: 'Host Business' },
        { id: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'Zoe', venue_name: 'Zen Studio' },
      ],
      any_available_practitioner_config: { mode: 'priority', calendar_order: [] },
      collective: {
        id: 'col-1',
        name: 'Northside',
        public_name: 'Northside Hair',
        host_venue_name: 'Host Business',
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
    refetch: mockRefetchVenue,
  }),
}));

import BookingSettingsScreen from '@/app/(app)/manage/booking-settings';

beforeEach(() => {
  mockUpdateFlagsAsync.mockClear();
  mockUpdateVenueAsync.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockPush.mockClear();
  mockRefetchFlags.mockClear();
  mockRefetchVenue.mockClear();
});

describe('Booking settings for a member of a live collective', () => {
  beforeEach(() => {
    mockIsHost = false;
  });

  it("shows the collective's values read-only and says who sets them", async () => {
    await render(<BookingSettingsScreen />);
    expect(
      screen.getByText(
        "You're part of Northside, hosted by Host Business. Your clients book on the Northside page. Host Business sets the settings marked Northside.",
      ),
    ).toBeTruthy();
    const staffFirst = screen.getByLabelText('Staff-first booking');
    expect(staffFirst.props.value).toBe(true);
    expect(staffFirst.props.disabled).toBe(true);
    expect(screen.getAllByText('Host Business sets this for Northside.').length).toBeGreaterThanOrEqual(4);
    await act(async () => {
      fireEvent(staffFirst, 'valueChange', false);
    });
    expect(mockUpdateFlagsAsync).not.toHaveBeenCalled();
  });

  it('shows sign-in read-only, and the priority list with every business', async () => {
    await render(<BookingSettingsScreen />);
    const signIn = screen.getByLabelText('Require sign-in to book');
    expect(signIn.props.value).toBe(true);
    expect(signIn.props.disabled).toBe(true);
    expect(screen.getByText(/1\. Hana at Host Business/)).toBeTruthy();
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

  it('saves a change for every business and says so', async () => {
    await render(<BookingSettingsScreen />);
    expect(
      screen.getByText(
        'You host Northside. Settings marked Northside apply to the Northside page and to online bookings at every business in it.',
      ),
    ).toBeTruthy();
    const staffFirst = screen.getByLabelText('Staff-first booking');
    expect(staffFirst.props.disabled).toBe(false);
    await act(async () => {
      fireEvent(staffFirst, 'valueChange', false);
    });
    // Asked first (card-on-file plan §21.3 item 3); nothing is saved until the host says yes.
    expect(screen.getByText('This changes it for every business in Northside.')).toBeTruthy();
    expect(mockUpdateFlagsAsync).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Change for everyone'));
    expect(mockUpdateFlagsAsync).toHaveBeenCalledTimes(1);
    // The save names the collective settings' version it read (§21.3 item 6).
    expect(mockUpdateFlagsAsync.mock.calls[0][0]).toEqual(
      expect.objectContaining({ staff_first_booking_flow: false, booking_settings_version: 3 }),
    );
    expect(await screen.findByText('Saved for Northside.')).toBeTruthy();
  });

  it('saves nothing when the host cancels the question', async () => {
    await render(<BookingSettingsScreen />);
    await act(async () => {
      fireEvent(screen.getByLabelText('Staff-first booking'), 'valueChange', false);
    });
    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByText('This changes it for every business in Northside.')).toBeNull();
    expect(mockUpdateFlagsAsync).not.toHaveBeenCalled();
  });

  it('says someone else changed it, and reads the settings again, on a stale save', async () => {
    const { ApiError } = jest.requireActual('@/lib/api/client');
    mockUpdateFlagsAsync.mockImplementationOnce(() =>
      Promise.reject(
        new ApiError('Host Business changed this a moment ago. Here is the current setting.', 412, {
          error: 'Host Business changed this a moment ago. Here is the current setting.',
          code: 'COLLECTIVE_SETTINGS_CHANGED',
          booking_settings_version: 4,
        }),
      ),
    );
    await render(<BookingSettingsScreen />);
    await act(async () => {
      fireEvent(screen.getByLabelText('Staff-first booking'), 'valueChange', false);
    });
    await fireEvent.press(screen.getByText('Change for everyone'));
    expect(await screen.findByText('Host Business changed this a moment ago. Here is the current setting.')).toBeTruthy();
    expect(mockRefetchFlags).toHaveBeenCalled();
    expect(mockRefetchVenue).toHaveBeenCalled();
    // The switch shows the collective's value again.
    expect(screen.getByLabelText('Staff-first booking').props.value).toBe(true);
  });

  it('asks before changing sign-in for everyone, and sends the version', async () => {
    await render(<BookingSettingsScreen />);
    await act(async () => {
      fireEvent(screen.getByLabelText('Require sign-in to book'), 'valueChange', false);
    });
    await fireEvent.press(screen.getByText('Change for everyone'));
    expect(mockUpdateVenueAsync).toHaveBeenCalledWith({
      require_account_login_for_bookings: false,
      booking_settings_version: 3,
    });
  });

  it('links each collective row to every collective setting in one place', async () => {
    await render(<BookingSettingsScreen />);
    const links = screen.getAllByTestId('see-all-collective-settings');
    // Sign-in and the four optional features the collective decides.
    expect(links).toHaveLength(5);
    await fireEvent.press(links[0]);
    expect(mockPush).toHaveBeenCalledWith('/collective-area?tab=settings');
  });
});
