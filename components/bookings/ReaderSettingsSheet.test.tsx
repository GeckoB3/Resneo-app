/**
 * ReaderSettingsSheet availability gate.
 *
 * The gate has to match `TakePaymentSheet` and `TerminalProvider` exactly:
 * native module AND publishable key. It checked the module alone, so a build
 * with the module but no key — which the production EAS profile was, see
 * Docs/GO_LIVE_CHECK.md §1.1 — would open the sheet, start a scan, and die at
 * connection-token time looking like a hardware fault.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Render Sheet children inline when visible (avoids gesture-handler/Modal).
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

let mockSdkAvailable = true;
jest.mock('@/lib/payments/terminal-sdk', () => ({
  isTerminalSdkAvailable: () => mockSdkAvailable,
}));

/**
 * The body calls the Terminal hooks, which need the SDK and a provider. This
 * suite is about whether the body is reached at all, so stub it — reaching it is
 * asserted through a marker rather than by driving real reader state.
 */
jest.mock('@/lib/payments/bluetoothReader', () => ({
  useBluetoothReader: () => ({
    status: 'idle',
    error: null,
    discovered: [],
    connected: null,
    batteryLevel: null,
    batteryLow: false,
    updateProgress: null,
    scan: jest.fn(),
    connect: jest.fn(),
    reconnectRemembered: jest.fn(),
    forget: jest.fn(),
    abort: jest.fn(),
    reset: jest.fn(),
  }),
}));

import { ReaderSettingsSheet } from '@/components/bookings/ReaderSettingsSheet';

const UNAVAILABLE = /not available on this version of the app/;
const ORIGINAL_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

beforeEach(() => {
  mockSdkAvailable = true;
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_fixture';
});
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  else process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = ORIGINAL_KEY;
});

describe('ReaderSettingsSheet availability gate', () => {
  it('opens the reader body when the build has both the module and a key', async () => {
    await render(<ReaderSettingsSheet visible onClose={jest.fn()} />);
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  it('refuses when the native module is missing (Expo Go, stale store build)', async () => {
    mockSdkAvailable = false;
    await render(<ReaderSettingsSheet visible onClose={jest.fn()} />);
    expect(screen.getByText(UNAVAILABLE)).toBeTruthy();
  });

  it('refuses when the build carries no Stripe publishable key', async () => {
    // The case this test file exists for: module present, key absent. Before the
    // fix this opened a sheet that could only fail later.
    delete process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    await render(<ReaderSettingsSheet visible onClose={jest.fn()} />);
    expect(screen.getByText(UNAVAILABLE)).toBeTruthy();
  });

  /*
   * "Update from the App Store" is right for a real user and useless to a
   * developer, so the dev hint has to distinguish the two failures — they send
   * you to completely different places.
   */
  it('blames the missing key in development when the module is present', async () => {
    delete process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    await render(<ReaderSettingsSheet visible onClose={jest.fn()} />);
    expect(screen.getByText(/no EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY/)).toBeTruthy();
  });

  it('blames the missing native module in development when that is the cause', async () => {
    mockSdkAvailable = false;
    await render(<ReaderSettingsSheet visible onClose={jest.fn()} />);
    expect(screen.getByText(/native Terminal module is missing/)).toBeTruthy();
  });

  it('renders nothing at all while closed', async () => {
    await render(<ReaderSettingsSheet visible={false} onClose={jest.fn()} />);
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
    expect(screen.queryByText('Card reader')).toBeNull();
  });
});
