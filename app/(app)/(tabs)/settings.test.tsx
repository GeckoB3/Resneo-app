/**
 * More tab (settings.tsx) — the Ask ResNeo entry (R27).
 *
 * The settings search field used to sit at the top of this tab; Ask ResNeo
 * took its place, so what is worth pinning is that the row is there and that
 * it opens the assistant screen. The pure `buildDestinations` gating lives in
 * `settings-destinations.test.ts`.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.2.3' } } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
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

// The hero pulls in react-native-svg; stub it — it is not under test.
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
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({
    data: { staff: { name: 'Sam Staff', email: 'sam@example.com', role: 'admin' } },
    isLoading: false,
  }),
}));
jest.mock('@/lib/queries/useBillingStatus', () => ({
  useBillingStatus: () => ({ data: undefined }),
}));
// The in-person payments switch mutates through this; mocked like every other
// query hook here, since the screen is rendered without a QueryClientProvider.
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useUpdateVenue: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: {
      id: 'venue-1',
      pricing_tier: 'appointments',
      booking_model: 'unified_scheduling',
      active_booking_models: ['unified_scheduling'],
      enabled_models: [],
      feature_flags: { resolved: { compliance_records_enabled: true }, raw: {} },
    },
    name: 'Test Venue',
    isLoading: false,
  }),
}));

import MoreScreen from '@/app/(app)/(tabs)/settings';

describe('More tab — Ask ResNeo', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('offers Ask ResNeo where the settings search used to be', async () => {
    await render(<MoreScreen />);
    expect(screen.getByText('Ask ResNeo')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search settings')).toBeNull();
  });

  it('opens the assistant screen when the row is pressed', async () => {
    await render(<MoreScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Ask ResNeo'));
    });
    expect(mockPush).toHaveBeenCalledWith('/assistant');
  });
});
