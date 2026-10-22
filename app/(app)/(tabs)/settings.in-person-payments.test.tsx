/**
 * More tab: what is left of in-person payments here (Tap to Pay §6.7).
 *
 * The switch, the card reader and Tap to Pay on iPhone moved to Booking settings,
 * "Payments at your venue", for admins of an Appointments-plan venue (owner,
 * 2026-10-15; the switch's own tests are booking-settings.in-person-payments).
 * Team members cannot open Booking settings, so they keep the card reader row
 * here, under "Card payments in person", once the venue has it on; an admin sees
 * none of it in More, and the Booking settings row says payments are there.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
// Announcements have their own tests.
jest.mock('@/components/ui/PlatformAnnouncementBanners', () => ({ PlatformAnnouncementBanners: () => null }));
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
let mockCollectives: unknown[] = [];
jest.mock('@/lib/queries/useCollectives', () => ({
  useCollectives: () => ({ data: { collectives: mockCollectives } }),
}));
jest.mock('@/lib/queries/useOrders', () => ({ useOrdersTile: () => ({ enabled: false, newCount: null }) }));
// The way back after Checkout goes off has its own tests (settings-destinations, the switches suite).
jest.mock('@/lib/queries/useFeatureSwitches', () => ({
  usePosWayBack: () => ({ orders: false, ordersNewCount: null, salesHistory: false }),
}));
jest.mock('@/lib/queries/usePos', () => ({ usePosBootstrap: () => ({ data: undefined }) }));
// One site: no site picker (web roles plan §6.2c has its own tests in settings.test.tsx).
jest.mock('@/lib/queries/useMeSites', () => ({ useMeSites: () => ({ data: undefined }) }));
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
let mockTier = 'appointments';
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: {
      id: 'venue-1',
      pricing_tier: mockTier,
      booking_model: 'unified_scheduling',
      active_booking_models: ['unified_scheduling'],
      enabled_models: [],
      feature_flags: { resolved: {}, raw: {} },
      in_person_payments_enabled: mockEnabled,
      stripe_connected_account_id: 'acct_123',
    },
    name: 'Test Venue',
    isLoading: false,
  }),
}));

let mockTapToPayApplies = false;
jest.mock('@/providers/TapToPayProvider', () => ({ useTapToPay: () => ({ applies: mockTapToPayApplies }) }));
jest.mock('@/components/payments/TapToPaySettings', () => ({
  TapToPaySettings: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>Tap to Pay settings</Text>;
  },
}));
jest.mock('@/components/bookings/ReaderSettingsSheet', () => ({ ReaderSettingsSheet: () => null }));

import MoreScreen from '@/app/(app)/(tabs)/settings';

const SWITCH = 'Take card payments in person';
const GROUP = 'Card payments in person';
const READER = 'Bluetooth card reader';

beforeEach(() => {
  mockRole = 'admin';
  mockEnabled = false;
  mockTier = 'appointments';
  mockTapToPayApplies = false;
});

describe('More tab: in-person payments', () => {
  it('never shows the switch: it is in Booking settings now', async () => {
    for (const role of ['admin', 'staff']) {
      mockRole = role;
      mockEnabled = true;
      await render(<MoreScreen />);
      expect(screen.queryByLabelText(SWITCH)).toBeNull();
      expect(screen.queryByText(/Connect Stripe first/)).toBeNull();
      expect(screen.queryByText(/always your team's choice/)).toBeNull();
    }
  });

  it('shows an admin none of it, and says Booking settings has payments', async () => {
    mockEnabled = true;
    mockTapToPayApplies = true;
    await render(<MoreScreen />);
    expect(screen.queryByText(READER)).toBeNull();
    expect(screen.queryByText('Tap to Pay settings')).toBeNull();
    expect(screen.queryByText(GROUP)).toBeNull();
    expect(screen.getByText('Booking types, guest accounts and payments')).toBeTruthy();
  });

  it('keeps the card reader and Tap to Pay for a team member once the venue has it on', async () => {
    mockRole = 'staff';
    mockEnabled = true;
    mockTapToPayApplies = true;
    await render(<MoreScreen />);
    expect(screen.getByText(GROUP)).toBeTruthy();
    expect(screen.queryByText('In-person payments')).toBeNull();
    expect(screen.getByText(READER)).toBeTruthy();
    expect(screen.getByText('Tap to Pay on iPhone')).toBeTruthy();
    expect(screen.getByText('Tap to Pay settings')).toBeTruthy();
  });

  it('shows a team member nothing while the venue has it off', async () => {
    mockRole = 'staff';
    mockEnabled = false;
    await render(<MoreScreen />);
    expect(screen.queryByText(READER)).toBeNull();
    expect(screen.queryByText(GROUP)).toBeNull();
  });

  it("keeps the card reader in More for an admin whose plan has no Booking settings group", async () => {
    mockTier = 'restaurant';
    mockEnabled = true;
    await render(<MoreScreen />);
    expect(screen.getByText(READER)).toBeTruthy();
    expect(screen.queryByLabelText(SWITCH)).toBeNull();
  });
});
