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
// Announcements have their own tests.
jest.mock('@/components/ui/PlatformAnnouncementBanners', () => ({ PlatformAnnouncementBanners: () => null }));
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

// The hero pulls in react-native-svg; stub it, keeping what it was given (the site picker).
const mockHeroProps: { siteSwitch?: { onPress: () => void; inviteCount: number } }[] = [];
jest.mock('@/components/more/MoreHero', () => ({
  MoreHero: (props: { siteSwitch?: { onPress: () => void; inviteCount: number } }) => {
    mockHeroProps.push(props);
    return null;
  },
}));
// The login's sites (web roles plan §6.2c): one, unless a test says otherwise.
let mockMeSites: unknown = undefined;
jest.mock('@/lib/queries/useMeSites', () => ({ useMeSites: () => ({ data: mockMeSites }) }));

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
jest.mock('@/lib/queries/useNotifications', () => ({
  useNotifications: () => ({ data: { unreadCount: 0 } }),
}));
let mockStaff: Record<string, unknown> = { name: 'Sam Staff', email: 'sam@example.com', role: 'admin' };
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({
    data: { staff: mockStaff },
    isLoading: false,
  }),
}));
const mockUseBillingStatus = jest.fn();
jest.mock('@/lib/queries/useBillingStatus', () => ({
  useBillingStatus: (enabled: boolean) => {
    mockUseBillingStatus(enabled);
    return { data: undefined };
  },
}));
// The in-person payments switch mutates through this; mocked like every other
// query hook here, since the screen is rendered without a QueryClientProvider.
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useUpdateVenue: () => ({ mutateAsync: jest.fn() }),
}));
// A uuid, as the web's `?site=` deep link needs (web roles plan §6.2b).
const mockVenueId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: {
      id: mockVenueId,
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

describe('More tab: the site picker in the header (web roles plan §6.2c)', () => {
  const site = (id: string, name: string) => ({
    venue_id: id,
    name,
    role: 'admin',
    role_key: 'admin',
    is_owner: false,
    onboarding_complete: true,
  });

  beforeEach(() => {
    mockPush.mockClear();
    mockHeroProps.length = 0;
  });
  afterEach(() => {
    mockMeSites = undefined;
  });

  it('is not offered with one site and nothing waiting: no change for anyone else', async () => {
    mockMeSites = {
      home_venue_id: 'v1',
      active_venue_id: 'v1',
      sites: [site('v1', 'Northside')],
      pending_invites: [],
      overview_eligible: false,
    };
    await render(<MoreScreen />);
    expect(mockHeroProps.at(-1)?.siteSwitch).toBeUndefined();
  });

  it('is offered with two sites, and opens the picker', async () => {
    mockMeSites = {
      home_venue_id: 'v1',
      active_venue_id: 'v1',
      sites: [site('v1', 'Northside'), site('v2', 'Southside')],
      pending_invites: [],
      overview_eligible: true,
    };
    await render(<MoreScreen />);
    const siteSwitch = mockHeroProps.at(-1)?.siteSwitch;
    expect(siteSwitch?.inviteCount).toBe(0);
    await act(async () => {
      siteSwitch?.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/sites');
  });

  it('is offered for an invitation waiting, with its count', async () => {
    mockMeSites = {
      home_venue_id: 'v1',
      active_venue_id: 'v1',
      sites: [site('v1', 'Northside')],
      pending_invites: [{ staff_id: 's9', venue_id: 'v9', venue_name: 'Eastside', role_key: 'staff', invited_at: null }],
      overview_eligible: false,
    };
    await render(<MoreScreen />);
    expect(mockHeroProps.at(-1)?.siteSwitch?.inviteCount).toBe(1);
  });
});

describe('More tab — the billing nudge (roles plan §5.3)', () => {
  afterEach(() => {
    mockStaff = { name: 'Sam Staff', email: 'sam@example.com', role: 'admin' };
    mockUseBillingStatus.mockClear();
  });

  it('asks for the billing status for an admin with "Billing, payouts and admins"', async () => {
    await render(<MoreScreen />);
    expect(mockUseBillingStatus).toHaveBeenLastCalledWith(true);
  });

  it('does not ask for an admin without it, who would only be refused', async () => {
    mockStaff = { ...mockStaff, role_key: 'admin', is_owner: false, permissions: { billing_payouts_admins: false } };
    await render(<MoreScreen />);
    expect(mockUseBillingStatus).toHaveBeenLastCalledWith(false);
  });
});

describe('More tab: Web dashboard (web roles plan §6.2b)', () => {
  it('opens the dashboard on the venue the app is showing', async () => {
    const openBrowser = jest.mocked(jest.requireMock<typeof import('expo-web-browser')>('expo-web-browser').openBrowserAsync);
    openBrowser.mockClear();
    await render(<MoreScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Web dashboard'));
    });
    expect(openBrowser).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/dashboard\\?site=${mockVenueId}$`)));
  });
});
