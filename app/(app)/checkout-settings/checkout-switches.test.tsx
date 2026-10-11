/**
 * Checkout settings and the switches (POS Part 5, design section 14 steps 2 and 6; A5): while
 * Checkout is off, an admin of a venue offered it (or paused) gets the landing here; once on, an
 * admin sees "Checkout is on" with the extras on top and "Switch off Checkout" at the bottom, and
 * "Checkout is on. Let's get it ready." just after switching on. A team member with
 * `manage_settings` sees the hub as before; a venue never offered it, today's message.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import Hub from './index';
import { onResponse, switchesResponse } from '@/lib/pos/switches/test-fixtures';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
let mockParams: Record<string, string> = {};
const mockTitles: (string | undefined)[] = [];
jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options?: { title?: string } }) => {
      mockTitles.push(options?.title);
      return null;
    },
  },
  useRouter: () => ({ push: jest.fn(), setParams: jest.fn() }),
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
let mockVenue: Record<string, unknown> = {};
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue, refetch: jest.fn(), terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/lib/queries/useVenue', () => ({ useVenue: () => ({ data: mockVenue }) }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
let mockPosOn = true;
jest.mock('@/lib/queries/usePos', () => ({ usePosEnabled: () => mockPosOn }));
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => ({ data: { staff: { id: 'staff-1', role: 'admin' } }, isLoading: false }) }));
let mockSwitches: unknown;
const mockSwitchReads: number[] = [];
jest.mock('@/lib/queries/useFeatureSwitches', () => ({
  useFeatureSwitches: () => {
    mockSwitchReads.push(1);
    return { data: mockSwitches, isLoading: false, isFetching: false, isError: false, refetch: jest.fn() };
  },
  useSetFeatureSwitch: () => ({ mutateAsync: jest.fn(), isPending: false }),
  applySwitchResult: jest.fn(),
  downloadVouchersList: jest.fn(),
}));
let mockCan = { is_admin: true, manage_settings: true, edit_capabilities: true };
jest.mock('@/lib/queries/useCheckoutSettings', () => ({
  useCheckoutSettingsQuery: () => ({
    data: {
      settings: { version: 1, track_stock_enabled: false },
      staff_capability_map: {},
      capability_defaults: {},
      can: mockCan,
      venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
    },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useSaveCheckoutSettings: () => jest.fn(),
}));

function venue(on: boolean, offer?: string) {
  return {
    id: 'venue-1',
    name: 'Studio',
    current_user_role: 'admin',
    feature_flags: { raw: { pos_enabled: on }, resolved: { pos_enabled: on } },
    ...(offer ? { feature_offers: { pos: { state: offer, reason: null, public_reason: null } } } : {}),
  };
}

beforeEach(() => {
  mockParams = {};
  mockTitles.length = 0;
  mockSwitchReads.length = 0;
  mockPosOn = true;
  mockCan = { is_admin: true, manage_settings: true, edit_capabilities: true };
  mockVenue = venue(true, 'on');
  mockSwitches = onResponse();
});

describe('Checkout settings while Checkout is on', () => {
  it('puts "Checkout is on" on top and "Switch off Checkout" at the bottom, for an admin', async () => {
    await render(<Hub />);
    expect(screen.getByText('Checkout is on')).toBeTruthy();
    expect(screen.getByText('Business and tax details')).toBeTruthy();
    expect(screen.getByText('Switch off Checkout')).toBeTruthy();
    expect(screen.queryByText("Checkout is on. Let's get it ready.")).toBeNull();
  });

  it('says "Checkout is on. Let\'s get it ready." just after switching on', async () => {
    mockParams = { welcome: '1' };
    await render(<Hub />);
    expect(screen.getByText("Checkout is on. Let's get it ready.")).toBeTruthy();
  });

  it('shows a team member the hub as before, reading no switches', async () => {
    mockCan = { is_admin: false, manage_settings: true, edit_capabilities: false };
    await render(<Hub />);
    expect(screen.getByText('Receipts')).toBeTruthy();
    expect(screen.queryByText('Checkout is on')).toBeNull();
    expect(screen.queryByText('Switch off Checkout')).toBeNull();
    expect(mockSwitchReads).toEqual([]);
  });
});

describe('Checkout settings while Checkout is off', () => {
  it('is the landing for an admin of an offered venue', async () => {
    mockPosOn = false;
    mockVenue = venue(false, 'available');
    mockSwitches = switchesResponse();
    await render(<Hub />);
    expect(mockTitles).toContain('Checkout settings');
    expect(screen.getByText('Take payments on your phone and at your desk')).toBeTruthy();
    expect(screen.getByText('Switch on Checkout')).toBeTruthy();
  });

  it('is the paused message while ResNeo pauses it', async () => {
    mockPosOn = false;
    mockVenue = venue(false, 'paused');
    await render(<Hub />);
    expect(screen.getByText('Checkout is paused')).toBeTruthy();
  });

  it("is today's message at a venue not offered it", async () => {
    mockPosOn = false;
    mockVenue = { ...venue(false), feature_flags: { raw: {}, resolved: {} } };
    await render(<Hub />);
    expect(screen.getByText("Checkout isn't available for your business right now.")).toBeTruthy();
    expect(screen.queryByText('Switch on Checkout')).toBeNull();
  });
});
