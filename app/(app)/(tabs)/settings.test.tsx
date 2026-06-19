/**
 * More tab (settings.tsx) — search keyword filter (Navigation & IA, Domain 01).
 *
 * Render test proving the new `keywords` synonyms surface the right row when a
 * user searches the web's vocabulary (e.g. "stripe" → Plan & payments, "csv" →
 * Import contacts). The pure `buildDestinations` gating lives in
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

describe('More tab — search keyword filter', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('surfaces "Plan & payments" when searching the synonym "stripe"', async () => {
    await render(<MoreScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search settings'), 'stripe');
    });
    // "stripe" appears in neither the label nor the hint of any other row, so a
    // hit proves the keyword index is consulted.
    expect(screen.getByText('Plan & payments')).toBeTruthy();
    expect(screen.queryByText('Communications')).toBeNull();
  });

  it('surfaces "Import contacts" when searching the synonym "csv"', async () => {
    await render(<MoreScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search settings'), 'csv');
    });
    expect(screen.getByText('Import contacts')).toBeTruthy();
  });

  it('shows the empty state for a query that matches no label, hint or keyword', async () => {
    await render(<MoreScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search settings'), 'zzzznomatch');
    });
    expect(screen.getByText(/No settings match/)).toBeTruthy();
  });
});
