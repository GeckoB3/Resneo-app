/**
 * Tap to Pay on iPhone warm-up and status (Apple's checklist 1.5, 1.6, 3.5–3.8).
 *
 * The reader hook is mocked: its own behaviour is covered in
 * lib/payments/reader-hooks.test.tsx. What matters here is WHEN the provider
 * prepares the reader and with which permissions.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, Platform, Text } from 'react-native';

type ConnectResult = { ok: boolean; error: string | null; reason?: string };

const mockReader = {
  status: 'idle',
  error: null as string | null,
  supported: true as boolean | null,
  progress: null as number | null,
  connect: jest.fn(async (): Promise<ConnectResult> => ({ ok: true, error: null })),
  checkSupport: jest.fn(async () => true),
  abort: jest.fn(async () => {}),
  reset: jest.fn(),
};
jest.mock('@/lib/payments/terminal', () => ({
  useTapToPayReader: () => mockReader,
}));

let mockConnectedReader: { deviceType: string } | null = null;
jest.mock('@/lib/payments/terminal-sdk', () => ({
  getTerminalSdk: () => ({
    useStripeTerminal: () => ({ connectedReader: mockConnectedReader }),
  }),
}));

let mockVenue: { card_present_ready?: boolean; current_user_role?: string } | null = null;
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue }),
}));

jest.mock('@/lib/payments/tap-to-pay-build-support', () => ({
  buildSupportsTapToPay: () => true,
}));

jest.mock('@/modules/tap-to-pay-education', () => ({
  showAppleTapToPayEducation: jest.fn(async () => true),
}));

import { TapToPayProvider, useTapToPay } from '@/providers/TapToPayProvider';

/** Captures the AppState listener so a test can bring the app to the foreground. */
let appStateListener: ((state: string) => void) | null = null;

function Probe() {
  const t = useTapToPay();
  return (
    <Text testID="probe">
      {JSON.stringify({ applies: t.applies, termsAccepted: t.termsAccepted, error: t.error })}
    </Text>
  );
}

function probe(): { applies: boolean; termsAccepted: boolean | null; error: string | null } {
  return JSON.parse(String(screen.getByTestId('probe').props.children));
}

async function mount() {
  await render(
    <TapToPayProvider>
      <Probe />
    </TapToPayProvider>,
  );
  // Let the launch warm-up's awaits settle.
  await act(async () => {});
}

beforeEach(() => {
  mockVenue = { card_present_ready: true, current_user_role: 'admin' };
  mockConnectedReader = null;
  mockReader.connect.mockReset();
  mockReader.connect.mockResolvedValue({ ok: true, error: null });
  mockReader.checkSupport.mockReset();
  mockReader.checkSupport.mockResolvedValue(true);
  appStateListener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: (state: string) => void,
  ) => {
    appStateListener = listener;
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TapToPayProvider (iOS)', () => {
  it('prepares the reader at launch, without showing terms or permission prompts', async () => {
    await mount();

    expect(mockReader.connect).toHaveBeenCalledTimes(1);
    expect(mockReader.connect).toHaveBeenCalledWith({
      tosAcceptancePermitted: false,
      promptForPermissions: false,
    });
    expect(probe().termsAccepted).toBe(true);
  });

  it('does not warm up when a reader is already connected', async () => {
    mockConnectedReader = { deviceType: 'chipper2X' };
    await mount();

    expect(mockReader.connect).not.toHaveBeenCalled();
  });

  it('does not warm up on a phone that cannot do Tap to Pay', async () => {
    mockReader.checkSupport.mockResolvedValue(false);
    await mount();

    expect(mockReader.connect).not.toHaveBeenCalled();
  });

  it('does nothing for a venue that is not ready for card payments', async () => {
    mockVenue = { card_present_ready: false, current_user_role: 'admin' };
    await mount();

    expect(mockReader.connect).not.toHaveBeenCalled();
    expect(probe().applies).toBe(false);
  });

  it('prepares again on return to the foreground, but not in a tight loop', async () => {
    jest.useFakeTimers();
    try {
      await mount();
      expect(mockReader.connect).toHaveBeenCalledTimes(1);

      // Straight back: inside the throttle window, so no second connect.
      await act(async () => {
        appStateListener?.('active');
      });
      expect(mockReader.connect).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(61_000);
        appStateListener?.('active');
      });
      expect(mockReader.connect).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('records that Apple’s terms have not been accepted, from Apple rather than a stored flag', async () => {
    mockReader.connect.mockResolvedValue({
      ok: false,
      error: 'not accepted',
      reason: 'terms_not_accepted',
    });
    await mount();

    expect(probe().termsAccepted).toBe(false);
    // Not an error: it is the ordinary "not turned on yet" state.
    expect(probe().error).toBeNull();
  });

  it('does not report a missing permission on the silent warm-up as an error', async () => {
    mockReader.connect.mockResolvedValue({
      ok: false,
      error: 'Location permission is needed',
      reason: 'permission_needed',
    });
    await mount();

    expect(probe().error).toBeNull();
    expect(probe().termsAccepted).toBeNull();
  });

  it('lets only an admin accept Apple’s terms when turning it on', async () => {
    function TurnOn() {
      const { enable } = useTapToPay();
      return <Text onPress={() => void enable()}>Turn on</Text>;
    }
    mockVenue = { card_present_ready: true, current_user_role: 'staff' };
    await render(
      <TapToPayProvider>
        <TurnOn />
      </TapToPayProvider>,
    );
    await act(async () => {});
    mockReader.connect.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByText('Turn on'));
    });

    expect(mockReader.connect).toHaveBeenCalledWith({
      tosAcceptancePermitted: false,
      promptForPermissions: true,
    });
  });
});

describe('TapToPayProvider (Android)', () => {
  it('leaves Android exactly as it was', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      await mount();
      expect(mockReader.connect).not.toHaveBeenCalled();
      expect(probe().applies).toBe(false);
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    }
  });
});
