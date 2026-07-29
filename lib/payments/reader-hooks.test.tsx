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

import {
  useBluetoothReader,
  __resetDiscoverySessionForTests,
} from '@/lib/payments/bluetoothReader';
import {
  READER_CONNECT_TIMEOUT_MS,
  READER_DISCOVERY_TIMEOUT_MS,
} from '@/lib/payments/reader-timeouts';
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
  // Discovery ownership is module-level (one global SDK command), so it has to be
  // reset between cases or an abandoned scan leaks into the next one.
  __resetDiscoverySessionForTests();
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
    // Fake timers because the abandoned attempt is time-boxed now: its deadline
    // must not outlive the suite as a real pending timer.
    jest.useFakeTimers();
    try {
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
    } finally {
      jest.useRealTimers();
    }
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

/**
 * Model the pinned SDK's REAL Bluetooth discovery semantics, which the default
 * mock above does not: `discoverReaders({ discoveryMethod: 'bluetoothScan' })`
 * resolves only when the discovery SESSION ENDS — cancelled, or ended by a
 * successful connect — and a second discovery while one is live is refused as
 * busy. Verified in beta.31's own native sources; see `reader-timeouts.ts`.
 */
function modelBluetoothDiscovery() {
  let live: (() => void) | null = null;
  const end = () => {
    const resolve = live;
    live = null;
    resolve?.();
  };
  mockApi.discoverReaders.mockImplementation(async () => {
    if (live) {
      return {
        error: {
          message: 'could not execute discoverReaders because the SDK is busy with another command',
        },
      };
    }
    const session = new Promise<Record<string, never>>((resolve) => {
      live = () => resolve({});
    });
    emitDiscovered(discoverable);
    return session;
  });
  mockApi.cancelDiscovering.mockImplementation(async () => {
    end();
    return {};
  });
  mockApi.connectReader.mockImplementation(async () => {
    // A successful connect ends the discovery, as it does on the device.
    end();
    return {};
  });
}

describe('a Bluetooth discovery that never completes on its own', () => {
  it('finishes the scan on the readers it found, not on the discovery promise', async () => {
    /**
     * THE "spins for ever" BUG. Awaiting `discoverReaders` as if it meant
     * "discovery finished" never returns for a Bluetooth scan, so the scan — and
     * every caller waiting on it — hung, with the sheet showing "Getting the card
     * reader ready" and Back disabled.
     */
    modelBluetoothDiscovery();
    discoverable = [WISEPAD];
    const { result } = await renderHook(() => useBluetoothReader());

    await act(async () => {
      await result.current.scan();
    });

    expect(result.current.discovered).toEqual([WISEPAD]);
    await waitFor(() => expect(result.current.status).toBe('found'));
  });

  it('reconnects to the remembered reader instead of deadlocking on it', async () => {
    /**
     * The exact device symptom: `reconnectRemembered` awaited the scan, and the
     * scan awaited a discovery that only the connect it was gating could end.
     */
    modelBluetoothDiscovery();
    mockStore.set('resneo_bt_reader_serial_own', 'WP-1');
    discoverable = [WISEPAD];
    const { result } = await renderHook(() => useBluetoothReader());

    const ok = await act(async () => result.current.reconnectRemembered());

    expect(ok).toBe(true);
    expect(mockApi.connectReader).toHaveBeenCalledWith(
      expect.objectContaining({ reader: WISEPAD }),
    );
  });

  it('ends a scan with a real error when nothing ever appears', async () => {
    // A silent reader must produce something staff can act on. Before the bound
    // this was an indefinite spinner with every button, Back included, disabled.
    jest.useFakeTimers();
    try {
      modelBluetoothDiscovery();
      discoverable = [];
      const { result } = await renderHook(() => useBluetoothReader());

      let scanning!: Promise<void>;
      await act(async () => {
        scanning = result.current.scan();
      });
      await act(async () => {
        jest.advanceTimersByTime(READER_DISCOVERY_TIMEOUT_MS + 1_000);
      });
      await act(async () => {
        await scanning;
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toMatch(/No card readers found/i);
      // The abandoned session is stopped too: leaving it running is what made the
      // NEXT attempt fail as busy.
      expect(mockApi.cancelDiscovering).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('takes over a discovery the other hook instance left running', async () => {
    /**
     * The sheet mounts this hook TWICE — the collect step and the pairing step —
     * and hands over between them. The abandoned instance's session is still live
     * at the SDK level, and the SDK answers the new instance "busy", so the
     * hand-over has to end the old session first.
     */
    modelBluetoothDiscovery();
    discoverable = [WISEPAD];
    const pairing = await renderHook(() => useBluetoothReader());
    await act(async () => {
      await pairing.result.current.scan();
    });

    const collect = await renderHook(() => useBluetoothReader());
    mockApi.cancelDiscovering.mockClear();
    await act(async () => {
      await collect.result.current.scan();
    });

    expect(mockApi.cancelDiscovering).toHaveBeenCalled();
    expect(collect.result.current.discovered).toEqual([WISEPAD]);
    expect(collect.result.current.status).not.toBe('error');
  });

  it('cancels a live scan when the step is left', async () => {
    modelBluetoothDiscovery();
    discoverable = [WISEPAD];
    const { result, unmount } = await renderHook(() => useBluetoothReader());
    await act(async () => {
      await result.current.scan();
    });
    mockApi.cancelDiscovering.mockClear();

    await act(async () => {
      unmount();
    });

    expect(mockApi.cancelDiscovering).toHaveBeenCalled();
  });
});

describe('a firmware install inside connectReader', () => {
  /**
   * A MANDATORY install runs inside `connectReader` and takes minutes. The connect
   * has a time budget so a dead handshake cannot leave `status: 'connecting'` set
   * for ever — but `withTimeout` only rejects the JS promise, it cancels nothing
   * native, so an expiry mid-install would report a perfectly healthy reader as
   * broken AND tell staff to switch it off and on again. Power-cycling a Terminal
   * reader mid-flash is the documented way to brick one.
   */
  it('keeps waiting while the reader is still reporting install progress', async () => {
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() => useBluetoothReader());
      // A connect that outlives the budget, as a firmware install does.
      mockApi.connectReader.mockImplementation(() => new Promise(() => {}));

      await act(async () => {
        void result.current.connect(WISEPAD);
      });
      await act(async () => {
        mockCallbacks.forEach((c) => c.onDidStartInstallingUpdate?.());
      });
      expect(result.current.status).toBe('updating');

      // Well past the budget, with the reader reporting progress throughout.
      for (let step = 0; step < 4; step += 1) {
        await act(async () => {
          jest.advanceTimersByTime(READER_CONNECT_TIMEOUT_MS * 0.75);
        });
        await act(async () => {
          mockCallbacks.forEach((c) => c.onDidReportReaderSoftwareUpdateProgress?.(0.25 * step));
        });
      }

      // Still installing, still honest about it — and no power-cycle advice.
      expect(result.current.status).toBe('updating');
      expect(result.current.error ?? '').not.toMatch(/Switch it off/i);
    } finally {
      jest.useRealTimers();
    }
  });

  it('completes a connect whose install outlived the budget', async () => {
    /**
     * The headline of "a budget of SILENCE, not a ceiling": the install must be
     * able to run PAST the budget and still have its connect complete.
     *
     * Without the re-arm the connect is abandoned at the budget, so when the
     * install finishes minutes later nothing resumes it — `setConnected` never
     * runs, the hook believes no reader is attached, and staff have to pair again
     * with a client waiting. That is a silent loss of completion, not of safety,
     * which is why this test asserts the CONNECTED reader and the remembered
     * serial rather than just the absence of an error.
     */
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() => useBluetoothReader());
      let finishConnect: (() => void) | undefined;
      mockApi.connectReader.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishConnect = () => resolve({ reader: WISEPAD });
          }),
      );

      let connecting!: Promise<boolean>;
      await act(async () => {
        connecting = result.current.connect(WISEPAD);
      });
      await act(async () => {
        mockCallbacks.forEach((c) => c.onDidStartInstallingUpdate?.());
      });

      // Three quarters of a budget at a time, with a progress report between, so
      // the budget is crossed TWICE while the reader is demonstrably alive.
      for (let step = 0; step < 3; step += 1) {
        await act(async () => {
          jest.advanceTimersByTime(READER_CONNECT_TIMEOUT_MS * 0.75);
        });
        await act(async () => {
          mockCallbacks.forEach((c) => c.onDidReportReaderSoftwareUpdateProgress?.(0.3 * step));
        });
      }

      // The install finishes and the handshake it was blocking completes.
      await act(async () => {
        mockCallbacks.forEach((c) => c.onDidFinishInstallingUpdate?.());
      });
      const ok = await act(async () => {
        finishConnect?.();
        return connecting;
      });

      expect(ok).toBe(true);
      expect(result.current.status).toBe('ready');
      expect(result.current.error).toBeNull();
      // The reader is actually attached, and remembered for next time.
      expect(result.current.connected).toEqual(WISEPAD);
      expect([...mockStore.values()]).toContain('WP-1');
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives up on an install that has gone silent, without power-cycle advice', async () => {
    // The other side of the bound: a handshake nothing is driving must not pin the
    // UI for the rest of the shift. It still must not claim the reader is broken
    // while the install it started has never reported finishing.
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() => useBluetoothReader());
      mockApi.connectReader.mockImplementation(() => new Promise(() => {}));

      let connecting!: Promise<boolean>;
      await act(async () => {
        connecting = result.current.connect(WISEPAD);
      });
      await act(async () => {
        mockCallbacks.forEach((c) => c.onDidStartInstallingUpdate?.());
      });
      // Two whole budgets of silence: one to expire, one to prove it is dead.
      await act(async () => {
        jest.advanceTimersByTime(READER_CONNECT_TIMEOUT_MS * 2 + 1_000);
      });
      const ok = await act(async () => connecting);

      expect(ok).toBe(false);
      expect(result.current.error).toMatch(/still updating/i);
      expect(result.current.error).not.toMatch(/Switch it off/i);
      // The install state is kept, so the reader is never described as broken.
      expect(result.current.status).toBe('updating');
    } finally {
      jest.useRealTimers();
    }
  });

  it('still reports a dead handshake when no install is running', async () => {
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() => useBluetoothReader());
      mockApi.connectReader.mockImplementation(() => new Promise(() => {}));

      let connecting!: Promise<boolean>;
      await act(async () => {
        connecting = result.current.connect(WISEPAD);
      });
      await act(async () => {
        jest.advanceTimersByTime(READER_CONNECT_TIMEOUT_MS + 1_000);
      });
      const ok = await act(async () => connecting);

      expect(ok).toBe(false);
      expect(result.current.status).toBe('error');
      expect(result.current.error).toMatch(/Switch it off and on again/i);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('abort (staff cancelled a slow prepare)', () => {
  it('stops the discovery and returns to a state the next attempt can use', async () => {
    modelBluetoothDiscovery();
    discoverable = [WISEPAD];
    const { result } = await renderHook(() => useBluetoothReader());
    await act(async () => {
      await result.current.scan();
    });

    await act(async () => {
      await result.current.abort();
    });

    expect(mockApi.cancelDiscovering).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.discovered).toEqual([]);

    // And the next scan is not refused as busy.
    await act(async () => {
      await result.current.scan();
    });
    expect(result.current.status).toBe('found');
  });

  it('leaves a firmware install alone', async () => {
    // Cancelling never disconnects, so an install carries on — reporting it as
    // idle would hide a reader that is still unusable for minutes.
    const { result } = await renderHook(() => useBluetoothReader());
    await act(async () => {
      mockCallbacks.forEach((c) => c.onDidStartInstallingUpdate?.());
    });

    await act(async () => {
      await result.current.abort();
    });

    expect(result.current.status).toBe('updating');
    expect(mockApi.disconnectReader).not.toHaveBeenCalled();
  });

  it('lets the tap to pay path be abandoned mid-discovery', async () => {
    jest.useFakeTimers();
    try {
      mockApi.discoverReaders.mockImplementation(() => new Promise(() => {}));
      const { result } = await renderHook(() => useTapToPayReader());
      await act(async () => {
        void result.current.connect();
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.abort();
      });

      expect(mockApi.cancelDiscovering).toHaveBeenCalled();
      expect(result.current.status).toBe('idle');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('SDK command serialisation', () => {
  /**
   * Terminal executes ONE command at a time. A second discover/connect while one
   * is running fails with "could not execute discoverReaders because the SDK is
   * busy with another command" and can leave the first caller half-applied — the
   * observed symptom being connect, immediate disconnect, reconnect, then a
   * discovery erroring with "You must disconnect from reader before discovering
   * readers". The races are real: "Use card reader" auto-reconnects while the
   * pairing step may also scan, a fresh pairing continues straight into
   * collection, and staff can double-tap any of it.
   */
  it('shares one discovery when two callers scan at once', async () => {
    discoverable = [WISEPAD];
    const { result } = await renderHook(() => useBluetoothReader());

    await act(async () => {
      await Promise.all([result.current.scan(), result.current.scan()]);
    });

    expect(mockApi.discoverReaders).toHaveBeenCalledTimes(1);
  });

  it('shares one connect when two callers connect at once', async () => {
    const { result } = await renderHook(() => useBluetoothReader());

    const [a, b] = await act(async () =>
      Promise.all([result.current.connect(WISEPAD), result.current.connect(WISEPAD)]),
    );

    expect(mockApi.connectReader).toHaveBeenCalledTimes(1);
    // Both callers still get a real answer rather than one hanging.
    expect(a).toBe(true);
    expect(b).toBe(true);
  });

  it('shares one auto-reconnect when the collect and pairing steps both ask', async () => {
    mockStore.set('resneo_bt_reader_serial_own', 'WP-1');
    discoverable = [WISEPAD];
    const { result } = await renderHook(() => useBluetoothReader());

    const [a, b] = await act(async () =>
      Promise.all([result.current.reconnectRemembered(), result.current.reconnectRemembered()]),
    );

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(mockApi.discoverReaders).toHaveBeenCalledTimes(1);
    expect(mockApi.connectReader).toHaveBeenCalledTimes(1);
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
