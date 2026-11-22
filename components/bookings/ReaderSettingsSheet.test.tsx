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
const mockInstallUpdate = jest.fn();
const mockCancelUpdate = jest.fn();
const mockDismissUpdate = jest.fn();
/** Per-test overrides of the reader hook's state (the optional-update cases set these). */
let mockReaderOverrides: Record<string, unknown> = {};
jest.mock('@/lib/payments/bluetoothReader', () => ({
  useBluetoothReader: () => ({
    status: 'idle',
    error: null,
    discovered: [],
    connected: null,
    batteryLevel: null,
    batteryLow: false,
    updateProgress: null,
    retrying: false,
    reconnecting: false,
    softwareUpdate: { available: null, dismissed: false, phase: 'idle', progress: null, failure: null },
    updateInstalling: false,
    installUpdate: mockInstallUpdate,
    cancelUpdate: mockCancelUpdate,
    dismissUpdate: mockDismissUpdate,
    scan: jest.fn(),
    connect: jest.fn(),
    reconnectRemembered: jest.fn(),
    forget: jest.fn(),
    abort: jest.fn(),
    reset: jest.fn(),
    ...mockReaderOverrides,
  }),
}));

import { fireEvent } from '@testing-library/react-native';

import { ReaderSettingsSheet } from '@/components/bookings/ReaderSettingsSheet';
import {
  READER_UPDATE_BATTERY_MESSAGE,
  READER_UPDATE_DONE_MESSAGE,
  READER_UPDATE_FAILED_MESSAGE,
  READER_UPDATE_INSTALLING_MESSAGE,
  READER_UPDATE_OFFER_MESSAGE,
} from '@/lib/payments/reader-software-update';

const UNAVAILABLE = /not available on this version of the app/;
const ORIGINAL_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

beforeEach(() => {
  mockReaderOverrides = {};
  mockInstallUpdate.mockReset();
  mockCancelUpdate.mockReset();
  mockDismissUpdate.mockReset();
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

/** READER-8: the optional update is offered here, and only here. */
describe('ReaderSettingsSheet optional reader update', () => {
  const READER = { serialNumber: 'WP-1', label: 'Front desk', deviceType: 'chipper2X' };
  const UPDATE = { deviceSoftwareVersion: '2.1.0', estimatedUpdateTime: 'estimate2To5Minutes' };
  const offered = (over: Record<string, unknown> = {}) => ({
    available: UPDATE,
    dismissed: false,
    phase: 'idle',
    progress: null,
    failure: null,
    ...over,
  });

  it('offers an available update with Install and Not now', async () => {
    mockReaderOverrides = { connected: READER, batteryLevel: 0.8, status: 'ready', softwareUpdate: offered() };
    await render(<ReaderSettingsSheet visible onClose={jest.fn()} />);

    expect(screen.getByText(READER_UPDATE_OFFER_MESSAGE)).toBeTruthy();
    await fireEvent.press(screen.getByText('Install update'));
    expect(mockInstallUpdate).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Not now'));
    expect(mockDismissUpdate).toHaveBeenCalledTimes(1);
  });

  it('offers nothing without a connected reader', async () => {
    mockReaderOverrides = { connected: null, softwareUpdate: offered() };
    await render(<ReaderSettingsSheet visible onClose={jest.fn()} />);
    expect(screen.queryByText(READER_UPDATE_OFFER_MESSAGE)).toBeNull();
  });

  it('offers nothing after Not now', async () => {
    mockReaderOverrides = { connected: READER, softwareUpdate: offered({ dismissed: true }) };
    await render(<ReaderSettingsSheet visible onClose={jest.fn()} />);
    expect(screen.queryByText(READER_UPDATE_OFFER_MESSAGE)).toBeNull();
  });

  it('asks for a charge first when the battery is under half', async () => {
    mockReaderOverrides = { connected: READER, batteryLevel: 0.3, status: 'ready', softwareUpdate: offered() };
    await render(<ReaderSettingsSheet visible onClose={jest.fn()} />);

    expect(screen.getByText(READER_UPDATE_BATTERY_MESSAGE)).toBeTruthy();
    await fireEvent.press(screen.getByText('Install update'));
    expect(mockInstallUpdate).not.toHaveBeenCalled();
  });

  it('shows progress while installing, with a way to stop it', async () => {
    mockReaderOverrides = {
      connected: READER,
      status: 'updating',
      updateInstalling: true,
      updateProgress: 0.42,
      softwareUpdate: offered({ phase: 'installing', progress: 0.42 }),
    };
    await render(<ReaderSettingsSheet visible onClose={jest.fn()} />);

    expect(screen.getByText(`${READER_UPDATE_INSTALLING_MESSAGE} 42%`)).toBeTruthy();
    expect(screen.getByTestId('reader-update-installing').props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 42,
    });
    // One updating line, not the connect-time one as well.
    expect(screen.queryByText(/This can take a few minutes/)).toBeNull();
    await fireEvent.press(screen.getByText('Stop the update'));
    expect(mockCancelUpdate).toHaveBeenCalledTimes(1);
  });

  it('says the reader is up to date when it finishes', async () => {
    mockReaderOverrides = {
      connected: READER,
      status: 'ready',
      softwareUpdate: { available: null, dismissed: false, phase: 'done', progress: null, failure: null },
    };
    await render(<ReaderSettingsSheet visible onClose={jest.fn()} />);
    expect(screen.getByText(READER_UPDATE_DONE_MESSAGE)).toBeTruthy();
  });

  it('shows a plain failure with Try again', async () => {
    mockReaderOverrides = {
      connected: READER,
      batteryLevel: 0.9,
      status: 'ready',
      softwareUpdate: offered({ phase: 'failed', failure: READER_UPDATE_FAILED_MESSAGE }),
    };
    await render(<ReaderSettingsSheet visible onClose={jest.fn()} />);
    expect(screen.getByText(READER_UPDATE_FAILED_MESSAGE)).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(mockInstallUpdate).toHaveBeenCalledTimes(1);
  });

  it('never writes an em-dash in the update copy', () => {
    for (const copy of [
      READER_UPDATE_OFFER_MESSAGE,
      READER_UPDATE_INSTALLING_MESSAGE,
      READER_UPDATE_DONE_MESSAGE,
      READER_UPDATE_FAILED_MESSAGE,
      READER_UPDATE_BATTERY_MESSAGE,
    ]) {
      expect(copy).not.toContain('—');
    }
  });
});
