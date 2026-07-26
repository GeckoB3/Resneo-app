/**
 * Stress tests for the two reader state machines against a mock Terminal SDK.
 *
 * These drive `useTapToPayReader` and `useBluetoothReader` through the real
 * sequences a staff member causes (connect, retry, abandon, venue switch,
 * firmware update, disconnect) because the reader layer is the part that cannot
 * be exercised on a device from here, and it is where every defect so far has
 * been found.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { Reader } from '@stripe/stripe-terminal-react-native';

/** Callbacks the hook passes to `useStripeTerminal`, captured per instance. */
type SdkCallbacks = {
  onUpdateDiscoveredReaders?: (readers: Reader.Type[]) => void;
  onDidStartInstallingUpdate?: () => void;
  onDidReportReaderSoftwareUpdateProgress?: (p: number) => void;
  onDidFinishInstallingUpdate?: () => void;
  onDidReportBatteryLevel?: (l: number) => void;
  onDidDisconnect?: () => void;
};

const mockCallbacks: SdkCallbacks[] = [];
const mockApi = {
  initialize: jest.fn(async () => ({})),
  discoverReaders: jest.fn(async () => ({})),
  cancelDiscovering: jest.fn(async () => ({})),
  connectReader: jest.fn(async () => ({})),
  disconnectReader: jest.fn(async () => ({})),
  retrievePaymentIntent: jest.fn(async () => ({})),
  collectPaymentMethod: jest.fn(async () => ({})),
  confirmPaymentIntent: jest.fn(async () => ({})),
  cancelCollectPaymentMethod: jest.fn(async () => ({})),
  supportsReadersOfType: jest.fn(
    async (): Promise<{ readerSupportResult?: boolean; error?: { message: string } }> => ({
      readerSupportResult: true,
    }),
  ),
  connectedReader: null as Reader.Type | null,
  discoveredReaders: [] as Reader.Type[],
};

/**
 * Android runtime-permission helper. ALWAYS resolves `{ error: ... }`, with
 * `error: null` meaning everything was granted.
 */
const mockPermissions = jest.fn(
  async (): Promise<{ error?: Record<string, string> | null }> => ({ error: null }),
);

jest.mock('@/lib/payments/terminal-sdk', () => {
  const actual = jest.requireActual<typeof import('@/lib/payments/terminal-sdk')>(
    '@/lib/payments/terminal-sdk',
  );
  return {
    ...actual,
    getTerminalSdk: () => ({
      useStripeTerminal: (props?: SdkCallbacks) => {
        if (props) mockCallbacks.push(props);
        return mockApi;
      },
      requestNeededAndroidPermissions: mockPermissions,
    }),
  };
});

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

let mockOwnerVenueId: string | null = null;
jest.mock('@/providers/LinkedVenueProvider', () => ({
  useLinkedVenueContext: () => ({ ownerVenueId: mockOwnerVenueId }),
}));

jest.mock('@/lib/payments/connection-token', () => ({
  ensureTerminalLocationId: jest.fn(async () => 'loc_1'),
  getCachedTerminalLocationId: () => 'loc_1',
  clearTerminalLocationCache: jest.fn(),
}));

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
}));

import { Platform } from 'react-native';

import { useBluetoothReader } from '@/lib/payments/bluetoothReader';
import { useTapToPayReader } from '@/lib/payments/terminal';
import { __resetTerminalInitForTests } from '@/lib/payments/terminal-sdk';

/** Build a reader row of the given device type. */
function reader(over: Partial<Reader.Type> & { deviceType: Reader.DeviceType }): Reader.Type {
  return {
    id: over.serialNumber ?? 'r1',
    serialNumber: over.serialNumber ?? 'SN-1',
    ...over,
  } as Reader.Type;
}

const PHONE = reader({ deviceType: 'tapToPay', serialNumber: 'PHONE-1' });
const WISEPAD = reader({ deviceType: 'chipper2X', serialNumber: 'WP-1', label: 'Front desk' });

/** Push readers to every mounted hook, as the SDK's global event does. */
function emitDiscovered(readers: Reader.Type[]) {
  for (const cb of mockCallbacks) cb.onUpdateDiscoveredReaders?.(readers);
}

/**
 * Readers the next discovery will surface. The real SDK emits them through the
 * global callback WHILE `discoverReaders` runs (the hook registers its resolver
 * first), so the mock does the same rather than making tests race it.
 */
let discoverable: Reader.Type[] = [];

beforeEach(() => {
  mockCallbacks.length = 0;
  mockStore.clear();
  mockOwnerVenueId = null;
  __resetTerminalInitForTests();
  Object.values(mockApi).forEach((v) => {
    if (typeof v === 'function' && 'mockClear' in v) (v as jest.Mock).mockClear();
  });
  mockApi.initialize.mockResolvedValue({});
  mockApi.connectedReader = null;
  mockPermissions.mockReset();
  mockPermissions.mockResolvedValue({ error: null });
  discoverable = [];
  mockApi.discoverReaders.mockImplementation(async () => {
    emitDiscovered(discoverable);
    return {};
  });
  mockApi.connectReader.mockResolvedValue({});
  mockApi.disconnectReader.mockResolvedValue({});
  mockApi.cancelDiscovering.mockResolvedValue({});
  mockApi.supportsReadersOfType.mockResolvedValue({ readerSupportResult: true });
  mockApi.connectedReader = null;
});

describe('useTapToPayReader', () => {
  it('initialises, discovers and connects the phone reader', async () => {
    discoverable = [PHONE];
    const { result } = await renderHook(() => useTapToPayReader());

    const res = await act(async () => result.current.connect());

    expect(res.ok).toBe(true);
    expect(mockApi.connectReader).toHaveBeenCalledWith(
      expect.objectContaining({ discoveryMethod: 'tapToPay', reader: PHONE, locationId: 'loc_1' }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('ignores Bluetooth readers arriving on the shared discovery event', async () => {
    // A Bluetooth reader must NOT satisfy a Tap to Pay connect.
    discoverable = [WISEPAD, PHONE];
    const { result } = await renderHook(() => useTapToPayReader());

    const res = await act(async () => result.current.connect());

    expect(res.ok).toBe(true);
    expect(mockApi.connectReader).toHaveBeenCalledWith(
      expect.objectContaining({ reader: PHONE }),
    );
  });

  it('reuses an already-connected phone reader without re-discovering', async () => {
    mockApi.connectedReader = PHONE;
    const { result } = await renderHook(() => useTapToPayReader());

    const res = await act(async () => result.current.connect());

    expect(res).toEqual({ ok: true, error: null });
    expect(mockApi.discoverReaders).not.toHaveBeenCalled();
  });

  it('disconnects a Bluetooth reader before connecting the phone', async () => {
    mockApi.connectedReader = WISEPAD;
    discoverable = [PHONE];
    const { result } = await renderHook(() => useTapToPayReader());

    await act(async () => {
      await result.current.connect();
    });

    expect(mockApi.disconnectReader).toHaveBeenCalled();
    expect(mockApi.connectReader).toHaveBeenCalledWith(expect.objectContaining({ reader: PHONE }));
  });

  it('returns the discovery failure reason to the caller', async () => {
    mockApi.discoverReaders.mockResolvedValue({ error: { message: 'NFC is switched off.' } });
    const { result } = await renderHook(() => useTapToPayReader());

    const res = await act(async () => result.current.connect());

    expect(res.ok).toBe(false);
    expect(res.error).toBe('NFC is switched off.');
  });

  it('returns the connect failure reason to the caller', async () => {
    mockApi.connectReader.mockResolvedValue({ error: { message: 'Reader busy.' } });
    discoverable = [PHONE];
    const { result } = await renderHook(() => useTapToPayReader());

    const res = await act(async () => result.current.connect());

    expect(res).toEqual({ ok: false, error: 'Reader busy.' });
  });

  it('cancels an in-flight discovery when the sheet unmounts', async () => {
    const { result, unmount } = await renderHook(() => useTapToPayReader());
    // Leave discovery hanging, as it would be while waiting for a reader.
    mockApi.discoverReaders.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      void result.current.connect();
      await Promise.resolve();
    });

    await act(async () => {
      unmount();
    });

    expect(mockApi.cancelDiscovering).toHaveBeenCalled();
  });

  it('initialises the SDK before probing device support', async () => {
    // Without this ordering the SDK answers "First initialize the Stripe
    // Terminal SDK before performing any action" every time, so the support gate
    // silently never runs and Tap to Pay is offered on incapable devices.
    const order: string[] = [];
    mockApi.initialize.mockImplementation(async () => {
      order.push('initialize');
      return {};
    });
    mockApi.supportsReadersOfType.mockImplementation(async () => {
      order.push('supportsReadersOfType');
      return { readerSupportResult: true };
    });

    const { result } = await renderHook(() => useTapToPayReader());
    await act(async () => {
      await result.current.checkSupport();
    });

    expect(order).toEqual(['initialize', 'supportsReadersOfType']);
    expect(result.current.supported).toBe(true);
  });

  it('leaves support unknown when the SDK cannot be initialised', async () => {
    mockApi.initialize.mockResolvedValue({ error: { message: 'no connection token' } });
    const { result } = await renderHook(() => useTapToPayReader());

    await act(async () => {
      await result.current.checkSupport();
    });

    // Unknown, not false: a token failure says nothing about the hardware, and
    // false would hide Tap to Pay on a capable phone.
    expect(result.current.supported).toBeNull();
    expect(mockApi.supportsReadersOfType).not.toHaveBeenCalled();
  });

  it('leaves support UNKNOWN when the SDK cannot answer, so the option stays visible', async () => {
    mockApi.supportsReadersOfType.mockResolvedValue({ error: { message: 'not initialised' } });
    const { result } = await renderHook(() => useTapToPayReader());

    await act(async () => {
      await result.current.checkSupport();
    });

    // `null` (unknown) keeps the Tap to Pay button on screen; `false` would hide
    // it on a perfectly capable phone.
    expect(result.current.supported).toBeNull();
  });
});

describe('switching between the two card paths', () => {
  it('frees a connected reader before scanning for Bluetooth readers', async () => {
    // Terminal refuses discovery while a reader is connected. Choosing Tap to
    // Pay and then switching to the card reader failed the scan with "You must
    // disconnect from reader before discovering readers."
    mockApi.connectedReader = PHONE;
    const order: string[] = [];
    mockApi.disconnectReader.mockImplementation(async () => {
      order.push('disconnect');
      return {};
    });
    mockApi.discoverReaders.mockImplementation(async () => {
      order.push('discover');
      emitDiscovered([]);
      return {};
    });

    const { result } = await renderHook(() => useBluetoothReader());
    await act(async () => {
      await result.current.scan();
    });

    expect(order).toEqual(['disconnect', 'discover']);
  });

  it('does not re-pair when the remembered reader is already connected', async () => {
    // The scan guard above would otherwise disconnect and pair again, which on
    // real hardware is a multi-second stall with the client waiting.
    mockStore.set('resneo_bt_reader_serial_own', 'SN-BT');
    mockApi.connectedReader = reader({ deviceType: 'wisePad3', serialNumber: 'SN-BT' });

    const { result } = await renderHook(() => useBluetoothReader());
    const ok = await act(async () => result.current.reconnectRemembered());

    expect(ok).toBe(true);
    expect(mockApi.discoverReaders).not.toHaveBeenCalled();
    expect(mockApi.disconnectReader).not.toHaveBeenCalled();
  });

  it('refuses the Bluetooth path when location permission is denied', async () => {
    // Previously only Tap to Pay enforced this, so a denied permission blocked
    // one path and let the other run on to fail later against real hardware.
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      mockPermissions.mockResolvedValue({
        error: { 'android.permission.ACCESS_FINE_LOCATION': 'denied' },
      });
      const { result } = await renderHook(() => useBluetoothReader());

      await act(async () => {
        await result.current.scan();
      });

      expect(result.current.status).toBe('error');
      // Names the app settings: Android stops prompting after two refusals, so
      // "permission needed" alone leaves staff with no way forward.
      expect(result.current.error).toContain('app settings');
      expect(mockApi.discoverReaders).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    }
  });

  it('proceeds on Android when every permission was granted', async () => {
    /**
     * The regression test for the bug this whole area had: the helper resolves
     * `{ error: null }` on success, and the old `'error' in result` check read
     * that as a refusal. Tap to Pay was therefore blocked on EVERY Android
     * device, however the permissions were set.
     */
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      mockPermissions.mockResolvedValue({ error: null });
      discoverable = [PHONE];
      const { result } = await renderHook(() => useTapToPayReader());

      const outcome = await act(async () => result.current.connect());

      expect(outcome).toEqual({ ok: true, error: null });
      expect(mockApi.connectReader).toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    }
  });
});

describe('adversarial sequences', () => {
  it('settles BOTH connects when staff double-tap (neither may hang)', async () => {
    discoverable = [PHONE];
    const { result } = await renderHook(() => useTapToPayReader());

    // Two concurrent attempts share one pending-resolver slot; if the second
    // overwrites the first, the first would hang until its 30s timeout.
    const [a, b] = await act(async () =>
      Promise.all([result.current.connect(), result.current.connect()]),
    );

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it('drops the reader when the linked venue changes', async () => {
    discoverable = [PHONE];
    const { result, rerender } = await renderHook(() => useTapToPayReader());
    await act(async () => {
      await result.current.connect();
    });
    mockApi.disconnectReader.mockClear();

    // Switching venue re-scopes the Stripe account, so the reader must go.
    mockOwnerVenueId = 'venue-2';
    await act(async () => {
      rerender({});
    });

    expect(mockApi.disconnectReader).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('makes exactly ONE silent reconnect attempt on an unexpected disconnect', async () => {
    const { result } = await renderHook(() => useBluetoothReader());
    await act(async () => {
      await result.current.connect(WISEPAD);
    });
    discoverable = [WISEPAD];
    mockApi.connectReader.mockClear();

    // A flaky reader can drop repeatedly; reconnecting on every drop would spin
    // a scan/connect loop in the middle of a payment.
    await act(async () => {
      mockCallbacks.forEach((c) => c.onDidDisconnect?.());
      mockCallbacks.forEach((c) => c.onDidDisconnect?.());
      mockCallbacks.forEach((c) => c.onDidDisconnect?.());
    });

    await waitFor(() => expect(mockApi.connectReader).toHaveBeenCalled());
    expect(mockApi.connectReader.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('recovers after a failed attempt when the staff member retries', async () => {
    mockApi.connectReader.mockResolvedValueOnce({ error: { message: 'Reader busy.' } });
    discoverable = [PHONE];
    const { result } = await renderHook(() => useTapToPayReader());

    const first = await act(async () => result.current.connect());
    expect(first.ok).toBe(false);

    // The failed attempt must not poison the resolver slot for the retry.
    const second = await act(async () => result.current.connect());
    expect(second.ok).toBe(true);
  });

  it('surfaces a clear failure when no reader ever appears', async () => {
    jest.useFakeTimers();
    try {
      discoverable = []; // discovery completes but emits nothing
      const { result } = await renderHook(() => useTapToPayReader());

      let promise!: Promise<{ ok: boolean; error: string | null }>;
      await act(async () => {
        promise = result.current.connect();
      });
      await act(async () => {
        jest.advanceTimersByTime(31_000);
      });
      const res = await promise;

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/No card reader became available/i);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useBluetoothReader', () => {
  it('scans and lists only external readers', async () => {
    const { result } = await renderHook(() => useBluetoothReader());

    // The phone's own reader must never appear as a pairable device.
    discoverable = [WISEPAD, PHONE];
    await act(async () => {
      await result.current.scan();
    });

    expect(result.current.discovered).toEqual([WISEPAD]);
    await waitFor(() => expect(result.current.status).toBe('found'));
  });

  it('reports a clear message when nothing is found', async () => {
    const { result } = await renderHook(() => useBluetoothReader());
    await act(async () => {
      await result.current.scan();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/No card readers found/i);
  });

  it('connects, remembers the serial, and exposes the provider reader', async () => {
    const { result } = await renderHook(() => useBluetoothReader());

    await act(async () => {
      await result.current.connect(WISEPAD);
      // The provider is the source of truth for "what is connected".
      mockApi.connectedReader = WISEPAD;
    });

    expect(mockApi.connectReader).toHaveBeenCalledWith(
      expect.objectContaining({ discoveryMethod: 'bluetoothScan', reader: WISEPAD }),
    );
    expect([...mockStore.values()]).toContain('WP-1');
  });

  it('surfaces a firmware update as its own state with progress', async () => {
    const { result } = await renderHook(() => useBluetoothReader());

    await act(async () => {
      mockCallbacks.forEach((c) => c.onDidStartInstallingUpdate?.());
    });
    expect(result.current.status).toBe('updating');

    await act(async () => {
      mockCallbacks.forEach((c) => c.onDidReportReaderSoftwareUpdateProgress?.(0.5));
    });
    expect(result.current.updateProgress).toBe(0.5);

    await act(async () => {
      mockCallbacks.forEach((c) => c.onDidFinishInstallingUpdate?.());
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.updateProgress).toBeNull();
  });

  it('warns when the battery is low', async () => {
    const { result } = await renderHook(() => useBluetoothReader());
    await act(async () => {
      mockCallbacks.forEach((c) => c.onDidReportBatteryLevel?.(0.1));
    });
    expect(result.current.batteryLow).toBe(true);

    await act(async () => {
      mockCallbacks.forEach((c) => c.onDidReportBatteryLevel?.(0.8));
    });
    expect(result.current.batteryLow).toBe(false);
  });

  it('forgets the reader and clears the remembered serial', async () => {
    const { result } = await renderHook(() => useBluetoothReader());
    await act(async () => {
      await result.current.connect(WISEPAD);
    });
    expect([...mockStore.values()]).toContain('WP-1');

    await act(async () => {
      await result.current.forget();
    });

    expect([...mockStore.values()]).not.toContain('WP-1');
    expect(mockApi.disconnectReader).toHaveBeenCalled();
  });

  it('reconnects to the remembered serial without a picker', async () => {
    const { result } = await renderHook(() => useBluetoothReader());
    await act(async () => {
      await result.current.connect(WISEPAD);
    });
    mockApi.connectReader.mockClear();

    discoverable = [WISEPAD];
    let ok = false;
    await act(async () => {
      ok = await result.current.reconnectRemembered();
    });

    expect(ok).toBe(true);
    expect(mockApi.connectReader).toHaveBeenCalledWith(
      expect.objectContaining({ reader: WISEPAD }),
    );
  });

  it('does not reconnect when nothing is remembered', async () => {
    const { result } = await renderHook(() => useBluetoothReader());
    const ok = await act(async () => result.current.reconnectRemembered());
    expect(ok).toBe(false);
    // No serial means no scan at all, so pairing opens immediately.
    expect(mockApi.discoverReaders).not.toHaveBeenCalled();
  });

  it('initialises only once across both hooks', async () => {
    await renderHook(() => useBluetoothReader());
    const { result } = await renderHook(() => useTapToPayReader());

    discoverable = [PHONE];
    await act(async () => {
      await result.current.connect();
    });
    mockApi.initialize.mockClear();

    const bt = await renderHook(() => useBluetoothReader());
    await act(async () => {
      await bt.result.current.scan();
    });

    // A second initialize() can come back as an error envelope and would abort
    // the scan, so the shared guard must suppress it.
    expect(mockApi.initialize).not.toHaveBeenCalled();
  });
});
