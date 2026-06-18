/**
 * Booking settings — the in-app Waitlist enable + slot-opens mode section
 * (Waitlist 09 High). Mirrors the web `WaitlistConfigSection`.
 *
 * Exercises:
 *  - the Appointment-waitlist Switch toggling `waitlist_v2` ON sends a PATCH that
 *    seeds `waitlist_config.mode`, and OFF strips the nested config,
 *  - the three-option mode selector (Staff choose / First in line / Offer to all)
 *    PATCHes `{ waitlist_v2: true, waitlist_config: { mode } }` via
 *    `useUpdateFeatureFlags`.
 *
 * jest hoists mock factories above imports, so every closed-over variable is
 * prefixed `mock*`.
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
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

// The feature-flags PATCH mutation — the unit under test.
const mockUpdateFlagsAsync = jest.fn((_patch?: unknown) => Promise.resolve({ resolved: {}, raw: {} }));
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useFeatureFlags: () => ({
    data: { calendars: [], any_available_practitioner_config: undefined },
    isLoading: false,
  }),
  useUpdateFeatureFlags: () => ({ mutateAsync: mockUpdateFlagsAsync, isPending: false }),
  useUpdateVenue: () => ({ mutateAsync: jest.fn(() => Promise.resolve({})), isPending: false }),
}));

// Admin venue on an Appointments-plan tier with the waitlist ON (staff_choose),
// so the mode selector renders without first flipping the toggle.
const mockRefetch = jest.fn();
let mockRawFlags: Record<string, unknown>;
let mockResolvedFlags: Record<string, boolean>;
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: {
      id: 'venue-1',
      current_user_role: 'admin',
      pricing_tier: 'plus',
      booking_model: 'unified_scheduling',
      active_booking_models: ['unified_scheduling'],
      require_account_login_for_bookings: false,
      feature_flags: { resolved: mockResolvedFlags, raw: mockRawFlags },
    },
    isLoading: false,
    refetch: mockRefetch,
  }),
}));

import BookingSettingsScreen from '@/app/(app)/manage/booking-settings';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => {
  mockUpdateFlagsAsync.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockResolvedFlags = { waitlist_v2: true };
  mockRawFlags = { waitlist_v2: true, waitlist_config: { mode: 'staff_choose' } };
});

describe('Booking settings — waitlist enable + mode', () => {
  it('renders the waitlist toggle and, when on, the three modes', async () => {
    await render(<BookingSettingsScreen />);
    expect(screen.getByText('Appointment waitlist')).toBeTruthy();
    // Mode labels mirrored from the web WAITLIST_MODE_LABELS.
    expect(screen.getByText('Staff choose')).toBeTruthy();
    expect(screen.getByText('First in line — notify in order')).toBeTruthy();
    expect(screen.getByText('Offer to all')).toBeTruthy();
  });

  it('PATCHes waitlist_config.mode when a different mode is chosen', async () => {
    await render(<BookingSettingsScreen />);

    await press(() => screen.getByText('Offer to all'));

    expect(mockUpdateFlagsAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdateFlagsAsync.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        waitlist_v2: true,
        waitlist_config: { mode: 'notify_all' },
      }),
    );
  });

  it('strips waitlist_config when the toggle is switched off', async () => {
    await render(<BookingSettingsScreen />);

    // The Switch carries accessibilityLabel="Appointment waitlist".
    await act(async () => {
      fireEvent(screen.getByLabelText('Appointment waitlist'), 'valueChange', false);
    });

    expect(mockUpdateFlagsAsync).toHaveBeenCalledTimes(1);
    const patch = mockUpdateFlagsAsync.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.waitlist_v2).toBe(false);
    expect(patch).not.toHaveProperty('waitlist_config');
  });

  it('seeds waitlist_config.mode when the toggle is switched on', async () => {
    mockResolvedFlags = { waitlist_v2: false };
    mockRawFlags = { waitlist_v2: false };
    await render(<BookingSettingsScreen />);

    await act(async () => {
      fireEvent(screen.getByLabelText('Appointment waitlist'), 'valueChange', true);
    });

    expect(mockUpdateFlagsAsync).toHaveBeenCalledTimes(1);
    const patch = mockUpdateFlagsAsync.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.waitlist_v2).toBe(true);
    expect(patch.waitlist_config).toEqual({ mode: 'notify_in_order' });
  });
});
