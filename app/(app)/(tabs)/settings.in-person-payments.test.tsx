/**
 * More tab — the in-person payments master switch (Tap to Pay §6.7).
 *
 * The venue flag was web-only, so an admin who installed the app found no
 * payment surface, no toggle, and nothing explaining why — they had to reach for
 * a laptop to flip one checkbox. This covers the gating that makes putting it in
 * the app safe: admins only, the "Stripe not connected yet" caveat, and a
 * rollback so a failed PATCH can't leave the switch lying about venue state.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.2.3' } } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

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
jest.mock('@/components/more/MoreHero', () => ({ MoreHero: () => null }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));
jest.mock('@/providers/AppLockProvider', () => ({
  useAppLock: () => ({ appLockEnabled: false, setAppLockEnabled: jest.fn(), supported: false }),
}));
jest.mock('@/lib/queries/useNotifications', () => ({
  useNotifications: () => ({ data: { unreadCount: 0 } }),
}));
jest.mock('@/lib/queries/useBillingStatus', () => ({
  useBillingStatus: () => ({ data: undefined }),
}));

let mockRole = 'admin';
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({
    data: { staff: { name: 'Sam Staff', email: 'sam@example.com', role: mockRole } },
    isLoading: false,
  }),
}));

let mockEnabled = false;
let mockStripeAccount: string | null = 'acct_123';
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: {
      id: 'venue-1',
      pricing_tier: 'appointments',
      booking_model: 'unified_scheduling',
      active_booking_models: ['unified_scheduling'],
      enabled_models: [],
      feature_flags: { resolved: {}, raw: {} },
      in_person_payments_enabled: mockEnabled,
      stripe_connected_account_id: mockStripeAccount,
    },
    name: 'Test Venue',
    isLoading: false,
  }),
}));

const mockUpdateVenue = jest.fn(async (_input: Record<string, unknown>) => ({}));
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useUpdateVenue: () => ({ mutateAsync: mockUpdateVenue }),
}));

import MoreScreen from '@/app/(app)/(tabs)/settings';

const SWITCH = 'Take card payments at your venue';

beforeEach(() => {
  mockRole = 'admin';
  mockEnabled = false;
  mockStripeAccount = 'acct_123';
  mockUpdateVenue.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
});

describe('More tab — in-person payments switch', () => {
  it('lets an admin turn it on, sending only that field', async () => {
    await render(<MoreScreen />);
    await act(async () => {
      fireEvent(screen.getByLabelText(SWITCH), 'valueChange', true);
    });
    expect(mockUpdateVenue).toHaveBeenCalledWith({ in_person_payments_enabled: true });
    expect(mockToast.success).toHaveBeenCalledWith('In-person payments turned on.');
  });

  it('lets an admin turn it back off', async () => {
    mockEnabled = true;
    await render(<MoreScreen />);
    await act(async () => {
      fireEvent(screen.getByLabelText(SWITCH), 'valueChange', false);
    });
    expect(mockUpdateVenue).toHaveBeenCalledWith({ in_person_payments_enabled: false });
    expect(mockToast.success).toHaveBeenCalledWith('In-person payments turned off.');
  });

  it('hides the switch from non-admins, matching the route’s own admin gate', async () => {
    mockRole = 'staff';
    mockEnabled = true;
    await render(<MoreScreen />);
    expect(screen.queryByLabelText(SWITCH)).toBeNull();
    // …but staff can still reach the reader once the venue has it on, so they
    // are not blocked from pairing hardware.
    expect(screen.getByText('Card reader')).toBeTruthy();
  });

  it('shows nothing at all to a non-admin whose venue has it off', async () => {
    mockRole = 'staff';
    mockEnabled = false;
    await render(<MoreScreen />);
    expect(screen.queryByLabelText(SWITCH)).toBeNull();
    expect(screen.queryByText('Card reader')).toBeNull();
  });

  it('warns when Stripe is not connected, because the flag alone does nothing', async () => {
    // card_present_ready is `enabled && stripe_connected_account_id`, so a venue
    // without an account can switch this on and still collect nothing.
    mockEnabled = true;
    mockStripeAccount = null;
    await render(<MoreScreen />);
    expect(screen.getByText(/Connect Stripe first/)).toBeTruthy();
  });

  it('does not nag about Stripe when the venue is connected', async () => {
    mockEnabled = true;
    mockStripeAccount = 'acct_123';
    await render(<MoreScreen />);
    expect(screen.queryByText(/Connect Stripe first/)).toBeNull();
  });

  it('keeps the reader row hidden until the venue flag is actually on', async () => {
    // Only the SERVER value may reveal the reader — an optimistic switch must not
    // offer pairing for a venue whose PATCH has not landed (or failed).
    mockEnabled = false;
    await render(<MoreScreen />);
    expect(screen.getByLabelText(SWITCH)).toBeTruthy();
    expect(screen.queryByText('Card reader')).toBeNull();
  });

  it('rolls the switch back and says so when the save fails', async () => {
    mockUpdateVenue.mockRejectedValueOnce(new Error('network'));
    await render(<MoreScreen />);
    const toggle = screen.getByLabelText(SWITCH);
    expect(toggle.props.value).toBe(false);
    await act(async () => {
      fireEvent(toggle, 'valueChange', true);
    });
    // Back to the venue's real state rather than stranded on a lie.
    expect(screen.getByLabelText(SWITCH).props.value).toBe(false);
    expect(mockToast.error).toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('reassures staff that collecting is never compulsory', async () => {
    // The frictionless-off guarantee (§1.3) is a promise to staff; an admin
    // turning this on should see it stated, not have to trust it.
    mockEnabled = true;
    await render(<MoreScreen />);
    expect(screen.getByText(/always your team's choice/)).toBeTruthy();
  });
});
