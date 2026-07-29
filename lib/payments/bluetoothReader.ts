import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Reader, StripeError } from '@stripe/stripe-terminal-react-native';

import { shouldSimulateCardReaders } from '@/lib/env';
import { ensureTerminalLocationId } from '@/lib/payments/connection-token';
import {
  ReaderTimeoutError,
  READER_CANCEL_TIMEOUT_MS,
  READER_CONNECT_TIMEOUT_MESSAGE,
  READER_CONNECT_TIMEOUT_MS,
  READER_DISCOVERY_TIMEOUT_MESSAGE,
  READER_DISCOVERY_TIMEOUT_MS,
  READER_TOKEN_TIMEOUT_MESSAGE,
  READER_TOKEN_TIMEOUT_MS,
  timeoutSignal,
  withTimeout,
} from '@/lib/payments/reader-timeouts';
import {
  androidPermissionMessage,
  ensureTerminalInitialized,
  getTerminalSdk,
  terminalErrorMessage,
  type TerminalHookApi,
} from '@/lib/payments/terminal-sdk';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';

/**
 * Physical Bluetooth card reader lifecycle (Tap to Pay design doc §7A.5).
 *
 * Sibling to `useTapToPayReader`, same lazy philosophy and the same
 * connection-token / Terminal Location plumbing. The collection flow itself is
 * identical from `useTakePayment`'s point of view — only which reader is
 * connected differs.
 *
 * Same mounting constraint as `useTapToPayReader`: only usable inside
 * `TerminalProvider` when the Terminal SDK is available.
 */

/** Reader status, including firmware update as a first-class state (§7A.5). */
export type BluetoothReaderStatus =
  | 'idle'
  | 'scanning'
  | 'found'
  | 'connecting'
  | 'updating'
  | 'ready'
  | 'disconnected'
  | 'error';

/** Battery percentage under which staff are warned to charge the reader. */
const LOW_BATTERY_THRESHOLD = 0.15;

/**
 * Share an in-flight call instead of starting a second one.
 *
 * The Terminal SDK executes ONE command at a time. A second `discoverReaders`
 * or `connectReader` while one is running fails with "could not execute
 * discoverReaders because the SDK is busy with another command", and can leave
 * the first caller's state half-applied — the symptom being a connect, an
 * immediate disconnect, a reconnect, and then a discovery that errors with
 * "You must disconnect from reader before discovering readers."
 *
 * The races are easy to hit: "Use card reader" auto-reconnects while the
 * pairing step may also scan, a just-paired reader continues straight into
 * collection, and staff can double-tap any of it.
 */
function shareInFlight<T>(
  ref: { current: Promise<T> | null },
  run: () => Promise<T>,
): Promise<T> {
  if (ref.current) return ref.current;
  const pending = run().finally(() => {
    // Only release the slot if this call still owns it. `abort()` clears the
    // slot while a call is in flight (its result is being abandoned), so an
    // unconditional clear here would null out the NEXT caller's promise and let
    // a third caller start a second concurrent SDK command.
    if (ref.current === pending) ref.current = null;
  });
  ref.current = pending;
  return pending;
}

/** How a Bluetooth discovery ended: the SDK's envelope, never a rejection. */
type DiscoveryOutcome = { error?: StripeError };

/** A discovery running at the SDK level, with a promise for when it ends. */
type DiscoverySession = { ended: Promise<DiscoveryOutcome> };

/**
 * The discovery session currently running, or null.
 *
 * MODULE-LEVEL on purpose. `discoverReaders` is ONE global native command — both
 * platforms refuse a second one while `discoverCancelable` is set ("could not
 * execute discoverReaders because the SDK is busy with another command") — but
 * the payment sheet mounts this hook TWICE, once in the collect step and once in
 * the pairing step, and hands over between them. A per-instance flag cannot know
 * that the instance being unmounted left a scan running, so the fresh instance's
 * first scan was answered "busy" (or, before the bound below, simply never
 * finished). One module-level owner lets any instance end the previous session.
 */
let liveDiscovery: DiscoverySession | null = null;

/**
 * Stop the live discovery and WAIT for the SDK to confirm it stopped.
 *
 * Both halves matter: dispatching `cancelDiscovering` is not enough, because the
 * SDK keeps refusing a new discovery until the old one's completion handler has
 * run. Never throws — every caller is already on a recovery path.
 */
async function endLiveDiscovery(terminal: TerminalHookApi): Promise<void> {
  const session = liveDiscovery;
  if (!session) return;
  try {
    await withTimeout(
      terminal.cancelDiscovering(),
      READER_CANCEL_TIMEOUT_MS,
      READER_DISCOVERY_TIMEOUT_MESSAGE,
    );
    await withTimeout(session.ended, READER_CANCEL_TIMEOUT_MS, READER_DISCOVERY_TIMEOUT_MESSAGE);
  } catch {
    // Nothing was discovering, or the SDK never confirmed. Either way the flag
    // below is left set so the next scan tries to clear it again.
  }
  if (liveDiscovery === session) liveDiscovery = null;
}

/** Test seam: forget the live discovery session between suites. */
export function __resetDiscoverySessionForTests(): void {
  liveDiscovery = null;
}

/**
 * Await a `connectReader` whose handshake may include a firmware install.
 *
 * The install runs INSIDE `connectReader` and legitimately takes minutes, so a
 * flat time budget is the wrong tool: `withTimeout` only rejects the JS promise,
 * it cancels nothing native, so an expiry would leave the reader mid-flash while
 * the sheet reported a failure and told staff to switch it off and on again —
 * which is the documented way to brick a Terminal reader.
 *
 * So the budget is re-armed for as long as the reader keeps REPORTING install
 * progress. An install that has gone silent for a whole budget still fails, so a
 * dead handshake cannot pin the UI for the rest of the shift.
 */
async function awaitReaderConnect<T>(
  work: Promise<T>,
  lastInstallActivityMs: () => number | null,
): Promise<T> {
  for (;;) {
    try {
      return await withTimeout(work, READER_CONNECT_TIMEOUT_MS, READER_CONNECT_TIMEOUT_MESSAGE);
    } catch (e) {
      const lastActivity = lastInstallActivityMs();
      const stillFlashing =
        lastActivity != null && Date.now() - lastActivity < READER_CONNECT_TIMEOUT_MS;
      if (e instanceof ReaderTimeoutError && stillFlashing) continue;
      throw e;
    }
  }
}

/** Remembered reader serial, per venue scope, so we can reconnect silently. */
function serialStorageKey(ownerVenueId: string | null): string {
  return `resneo_bt_reader_serial_${ownerVenueId ?? 'own'}`;
}

export interface UseBluetoothReader {
  status: BluetoothReaderStatus;
  error: string | null;
  /** Readers found by the current scan (a busy salon may see several). */
  discovered: Reader.Type[];
  connected: Reader.Type | null;
  /** 0-1 battery level of the connected reader, when reported. */
  batteryLevel: number | null;
  /** True when the connected reader's battery is low enough to warn about. */
  batteryLow: boolean;
  /** 0-1 firmware install progress while `status === 'updating'`. */
  updateProgress: number | null;
  /** Start scanning for nearby readers. */
  scan: () => Promise<void>;
  /** Connect to a specific discovered reader and remember it. */
  connect: (reader: Reader.Type) => Promise<boolean>;
  /** Scan and reconnect to the remembered serial without a picker. */
  reconnectRemembered: () => Promise<boolean>;
  /** Disconnect and forget the remembered reader for this venue scope. */
  forget: () => Promise<void>;
  /**
   * Abandon the scan/connect in flight and return to a clean state, cancelling
   * the SDK's discovery so it cannot break the next attempt. Never disconnects,
   * so a firmware install in progress is left alone.
   */
  abort: () => Promise<void>;
  reset: () => void;
}

/** See `shouldSimulateCardReaders`: defaults to `__DEV__`, overridable so a dev
 *  build can pair with a real WisePad instead of the simulator. */
const USE_SIMULATED = shouldSimulateCardReaders();

export function useBluetoothReader(): UseBluetoothReader {
  const sdk = getTerminalSdk();
  const accessToken = useAccessToken();
  const { ownerVenueId } = useLinkedVenueContext();

  const [status, setStatus] = useState<BluetoothReaderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<Reader.Type[]>([]);
  const [localConnected, setConnected] = useState<Reader.Type | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);

  const scopeRef = useRef<string | null>(ownerVenueId ?? null);
  const discoveredRef = useRef<Reader.Type[]>([]);
  // Single-shot guard + late-bound callback for the auto-reconnect below
  // (the handler is defined before `reconnectRemembered` exists).
  const reconnectAttemptedRef = useRef(false);
  const reconnectRememberedRef = useRef<(() => Promise<boolean>) | null>(null);
  /** The discovery THIS instance started, while it runs (for the cleanup below). */
  const mySessionRef = useRef<DiscoverySession | null>(null);
  /**
   * Resolver for "at least one reader has been seen", fed by the discovery
   * callback. A Bluetooth `discoverReaders` promise does not settle when readers
   * are found (see reader-timeouts.ts), so this is the signal `scan` waits on.
   */
  const readersFoundRef = useRef<(() => void) | null>(null);
  /**
   * Bumped by `abort()`. Work started under an older generation must not write
   * state or report an outcome: staff have cancelled and moved on.
   */
  const abortRef = useRef(0);
  /**
   * When the reader last reported firmware-install activity, or null when no
   * install is running. A REF, not the `status` state: the connect below closes
   * over no rendered value, and it is the connect's timeout that must consult it.
   */
  const installActivityRef = useRef<number | null>(null);
  // In-flight SDK work, shared by concurrent callers (see `shareInFlight`).
  const scanInFlightRef = useRef<Promise<void> | null>(null);
  const connectInFlightRef = useRef<Promise<boolean> | null>(null);
  const reconnectInFlightRef = useRef<Promise<boolean> | null>(null);
  /** Stable handle to the SDK for cleanup that must not re-run on every render. */
  const terminalRef = useRef<TerminalHookApi | null>(null);

  // Firmware updates block collection for tens of seconds to minutes, so they
  // are surfaced as their own state with determinate progress (§7A.5).
  const terminal = sdk!.useStripeTerminal({
    onUpdateDiscoveredReaders: (readers: Reader.Type[]) => {
      // Discovery events are GLOBAL (see the matching note in terminal.ts): drop
      // the phone's own Tap to Pay reader so it never appears in the list of
      // pairable Bluetooth readers.
      const external = readers.filter((r) => r.deviceType !== 'tapToPay');
      discoveredRef.current = external;
      setDiscovered(external);
      setStatus((prev) => (prev === 'scanning' && external.length > 0 ? 'found' : prev));
      // This — not the `discoverReaders` promise — is how a Bluetooth scan learns
      // it has succeeded.
      if (external.length > 0) readersFoundRef.current?.();
    },
    onDidStartInstallingUpdate: () => {
      // A mandatory install runs INSIDE `connectReader`, so the connect's time
      // budget has to know about it (see `awaitReaderConnect`).
      installActivityRef.current = Date.now();
      setUpdateProgress(0);
      setStatus('updating');
    },
    onDidReportReaderSoftwareUpdateProgress: (progress: string | number) => {
      const value = typeof progress === 'number' ? progress : Number(progress);
      // Every progress report is proof the reader is alive and still flashing,
      // which is what re-arms the connect budget rather than expiring it.
      installActivityRef.current = Date.now();
      if (Number.isFinite(value)) setUpdateProgress(value);
    },
    onDidFinishInstallingUpdate: () => {
      installActivityRef.current = null;
      setUpdateProgress(null);
      setStatus((prev) => (prev === 'updating' ? 'ready' : prev));
    },
    onDidReportBatteryLevel: (level: number) => {
      if (typeof level === 'number' && Number.isFinite(level)) setBatteryLevel(level);
    },
    onDidDisconnect: () => {
      setConnected(null);
      setStatus('disconnected');
      setError('Reader disconnected. Trying to reconnect.');
      // ONE silent reconnect to the remembered serial (§7A.5). Guarded so a
      // reader that keeps dropping cannot spin up an endless scan/connect loop
      // in the middle of a payment.
      if (!reconnectAttemptedRef.current) {
        reconnectAttemptedRef.current = true;
        void reconnectRememberedRef.current?.().finally(() => {
          // Allow one more attempt after a later successful connection.
          setTimeout(() => {
            reconnectAttemptedRef.current = false;
          }, 30_000);
        });
      }
    },
  });

  // Keep the cleanup's SDK handle current, in an effect (never during render).
  useEffect(() => {
    terminalRef.current = terminal;
  }, [terminal]);

  /**
   * Leaving the screen must stop an in-flight Bluetooth scan. Beyond the
   * battery cost of scanning forever, the SDK refuses to start a new discovery
   * while one is already running, so an abandoned scan would break the NEXT
   * attempt to pair.
   */
  useEffect(
    () => () => {
      readersFoundRef.current = null;
      const mine = mySessionRef.current;
      const terminal = terminalRef.current;
      // Only cancel a session this instance still owns: the sibling instance may
      // have started its own by now, and cancelling that one would break the
      // step staff have just moved to.
      if (mine && liveDiscovery === mine && terminal) {
        void endLiveDiscovery(terminal);
      }
    },
    [],
  );

  /** Linked-venue switch: drop the reader and the remembered serial scope. */
  useEffect(() => {
    const next = ownerVenueId ?? null;
    if (scopeRef.current === next) return;
    scopeRef.current = next;
    setConnected(null);
    setStatus('idle');
    setError(null);
    void terminal.disconnectReader().catch(() => {
      // Best effort; reconnection happens on next use.
    });
  }, [ownerVenueId, terminal]);

  /** Shared setup: initialise once and resolve the Terminal Location. */
  const prepare = useCallback(async (): Promise<string> => {
    // Shared one-shot init: scan and connect both call this, and the Tap to Pay
    // hook initialises too, so re-initialising here could fail the second
    // caller and abort an otherwise fine scan.
    // Time-boxed and de-duplicated inside `ensureTerminalInitialized`, which is
    // shared with the Tap to Pay hook and the device-support probe.
    const init = await ensureTerminalInitialized(terminal);
    if (!init.ok) {
      throw new Error(init.error ?? 'Could not start the card reader.');
    }
    if (Platform.OS === 'android' && sdk?.requestNeededAndroidPermissions) {
      const granted = await sdk.requestNeededAndroidPermissions({
        accessFineLocation: {
          title: 'Location permission',
          message: 'Location is required to connect to your card reader.',
          buttonPositive: 'Allow',
        },
      });
      /**
       * The result was previously ignored here while the Tap to Pay path
       * enforced it, so a refusal blocked Tap to Pay but let the reader path run
       * on. Stripe requires these permissions for card-present on BOTH paths, so
       * a real reader would have failed later and less clearly.
       */
      const refused = androidPermissionMessage(granted);
      if (refused) throw new Error(refused);
    }
    /**
     * Deliberately NOT bounded above: the permission call puts a system dialog on
     * screen and the staff member may take as long as they like to answer it.
     * The token fetch below is, though — `apiFetch` boxes each attempt but can
     * retry once after a 401, and its refresher awaits Supabase unbounded.
     */
    return withTimeout(
      ensureTerminalLocationId({ accessToken, ownerVenueId: ownerVenueId ?? null }),
      READER_TOKEN_TIMEOUT_MS,
      READER_TOKEN_TIMEOUT_MESSAGE,
    );
  }, [accessToken, ownerVenueId, sdk, terminal]);

  const scan = useCallback(async (): Promise<void> => {
    return shareInFlight(scanInFlightRef, async () => {
    const generation = abortRef.current;
    setError(null);
    setDiscovered([]);
    discoveredRef.current = [];
    try {
      await prepare();
      /**
       * Terminal refuses to discover while ANY reader is connected, so free it
       * first. Without this, choosing "Tap to Pay on this phone" and then
       * switching to the card reader in the same session fails the scan with
       * "You must disconnect from reader before discovering readers." The
       * connect path already guards this; discovery did not.
       */
      if (terminal.connectedReader) {
        await terminal.disconnectReader().catch(() => {
          // Already gone; the discovery below still works.
        });
      }
      // A session left running by the sibling hook instance, or by an earlier
      // "Scan again", must be ended or this discovery is refused as busy.
      await endLiveDiscovery(terminal);
      if (abortRef.current !== generation) return;

      setStatus('scanning');
      /**
       * WHY this is a race and not a plain await (the "spins for ever" bug):
       * for `bluetoothScan` the `discoverReaders` promise resolves only when the
       * discovery ENDS — cancelled, errored, or ended by a successful connect —
       * and the SDK's discovery timeout defaults to "never" (see
       * reader-timeouts.ts for where that is verified in the pinned beta).
       * Awaiting it as "the scan finished" deadlocked `reconnectRemembered`,
       * which awaits this scan before the connect that alone could end it.
       * Readers arrive on the callback, so wait for THAT — or for the session to
       * end, or for the budget to run out.
       */
      const found = new Promise<'found'>((resolve) => {
        readersFoundRef.current = () => resolve('found');
      });
      const session: DiscoverySession = { ended: Promise.resolve({}) };
      session.ended = terminal
        .discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: USE_SIMULATED })
        .catch((e: unknown) => ({
          error: {
            message: e instanceof Error ? e.message : 'Could not search for card readers.',
          } as StripeError,
        }))
        .then((res): DiscoveryOutcome => {
          // Identity-checked: a newer session may already own the slot.
          if (liveDiscovery === session) liveDiscovery = null;
          return res ?? {};
        });
      liveDiscovery = session;
      mySessionRef.current = session;

      const deadline = timeoutSignal(READER_DISCOVERY_TIMEOUT_MS);
      let outcome: 'found' | 'ended' | 'timeout';
      try {
        outcome = await Promise.race([
          found,
          session.ended.then(() => 'ended' as const),
          deadline.signal,
        ]);
      } finally {
        deadline.cancel();
        // Generation-guarded: a newer scan may already have installed its own
        // resolver, and clearing THAT would leave it deaf to the discovery
        // callback — waiting out its whole budget to report "no card readers
        // found" with readers plainly listed on screen.
        if (abortRef.current === generation) readersFoundRef.current = null;
      }
      if (abortRef.current !== generation) return;

      if (outcome === 'timeout') {
        // Leaving it scanning would drain the battery AND make the next attempt
        // fail as busy, which is how one bad scan poisoned the whole session.
        await endLiveDiscovery(terminal);
        if (abortRef.current !== generation) return;
        setStatus('error');
        setError(READER_DISCOVERY_TIMEOUT_MESSAGE);
        return;
      }
      if (outcome === 'ended') {
        const res = await session.ended;
        if (res?.error) {
          setStatus('error');
          setError(terminalErrorMessage(res.error, 'Could not search for card readers.'));
          return;
        }
        setStatus(discoveredRef.current.length > 0 ? 'found' : 'error');
        if (discoveredRef.current.length === 0) {
          setError('No card readers found. Check the reader is switched on and nearby.');
        }
        return;
      }
      // Readers are on screen. The session stays LIVE on purpose: a Bluetooth
      // connect must happen while its discovery is still running.
      setStatus('found');
    } catch (e) {
      if (abortRef.current !== generation) return;
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not search for card readers.');
    }
    });
  }, [prepare, terminal]);

  const connect = useCallback(
    async (reader: Reader.Type): Promise<boolean> => {
      return shareInFlight(connectInFlightRef, async () => {
      const generation = abortRef.current;
      setError(null);
      try {
        const locationId = await prepare();
        // Terminal holds one reader at a time. If the phone's own Tap to Pay
        // reader is connected from an earlier payment, free it first or this
        // connect fails.
        if (terminal.connectedReader?.deviceType === 'tapToPay') {
          await terminal.disconnectReader().catch(() => {
            // Already gone; the connect below still works.
          });
        }
        setStatus('connecting');
        /**
         * Bounded so a reader that dies mid-handshake cannot leave
         * `status: 'connecting'` set for ever (which disables every collect
         * button) — but the budget yields to a firmware install rather than
         * cutting one short. See `awaitReaderConnect`.
         */
        const res = await awaitReaderConnect(
          terminal.connectReader({ discoveryMethod: 'bluetoothScan', reader, locationId }),
          () => installActivityRef.current,
        );
        if (abortRef.current !== generation) return false;
        if (res?.error) {
          setStatus('error');
          setError(terminalErrorMessage(res.error, 'Could not connect to the card reader.'));
          return false;
        }
        const live = res.reader ?? reader;
        setConnected(live);
        if (typeof live.batteryLevel === 'number') setBatteryLevel(live.batteryLevel);
        // A mandatory firmware update may have flipped us to 'updating'; only
        // claim ready when it has not.
        setStatus((prev) => (prev === 'updating' ? prev : 'ready'));
        await SecureStore.setItemAsync(
          serialStorageKey(ownerVenueId ?? null),
          live.serialNumber,
        ).catch(() => {
          // Remembering is a convenience; failing it must not block payment.
        });
        return true;
      } catch (e) {
        if (abortRef.current !== generation) return false;
        /**
         * A reader that is still installing firmware is not a broken reader, and
         * must NEVER be given power-cycle advice: pulling the power mid-flash is
         * how one gets bricked. Keep the `updating` state (and its determinate
         * progress) and say what staff should actually do — nothing.
         */
        if (installActivityRef.current != null) {
          setError('Your reader is still updating. Leave it switched on and nearby.');
          return false;
        }
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Could not connect to the card reader.');
        return false;
      }
      });
    },
    [ownerVenueId, prepare, terminal],
  );

  /**
   * The connected reader comes from the SDK provider, not this hook's local
   * state, so EVERY consumer sees the same reader. The pairing step and the
   * collect step are separate component instances; keying off local state made
   * a freshly paired reader look disconnected to the collect step, which sent
   * staff back to pairing in a loop.
   * Tap to Pay connects through the same provider, so exclude that device type.
   */
  const providerReader = terminal.connectedReader ?? null;
  const connected =
    providerReader && providerReader.deviceType !== 'tapToPay'
      ? providerReader
      : (localConnected ?? null);

  const reconnectRemembered = useCallback(async (): Promise<boolean> => {
    return shareInFlight(reconnectInFlightRef, async () => {
    const generation = abortRef.current;
    let serial: string | null = null;
    try {
      serial = await SecureStore.getItemAsync(serialStorageKey(ownerVenueId ?? null));
    } catch {
      serial = null;
    }
    if (!serial) return false;

    /**
     * Already holding the remembered reader: nothing to do. Without this the
     * scan below would disconnect it (see the guard in `scan`) and pair again,
     * which on real hardware is a visible multi-second stall with the client
     * waiting.
     */
    const live = terminal.connectedReader;
    if (live && live.deviceType !== 'tapToPay' && live.serialNumber === serial) {
      setStatus('ready');
      return true;
    }

    await scan();
    if (abortRef.current !== generation) return false;
    const match = discoveredRef.current.find((r) => r.serialNumber === serial);
    // Not in this scan's results: fall back to the picker, which keeps listing
    // readers as they arrive. (The scan resolves on the FIRST sighting, so a
    // second reader in the room may not have been reported yet.)
    if (!match) return false;
    return connect(match);
    });
  }, [connect, ownerVenueId, scan, terminal]);

  // Late-bind for the disconnect handler, which is defined above this callback.
  // Done in an effect, never during render: mutating a ref while rendering is
  // unsafe under concurrent rendering.
  useEffect(() => {
    reconnectRememberedRef.current = reconnectRemembered;
  }, [reconnectRemembered]);

  const forget = useCallback(async (): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(serialStorageKey(ownerVenueId ?? null));
    } catch {
      // Nothing remembered.
    }
    await terminal.disconnectReader().catch(() => {
      // Already disconnected.
    });
    setConnected(null);
    setBatteryLevel(null);
    setStatus('idle');
    setError(null);
  }, [ownerVenueId, terminal]);

  const reset = useCallback(() => {
    setStatus(connected ? 'ready' : 'idle');
    setError(null);
  }, [connected]);

  /**
   * Staff's escape hatch: abandon whatever is in flight and come back to a clean
   * state, so the next attempt starts from scratch instead of inheriting a
   * half-finished one.
   *
   * Note what it does NOT do: it never disconnects the reader, so cancelling
   * during a mandatory firmware install cannot interrupt (or brick) it — which is
   * also why an `updating` status is left alone rather than being reported as
   * idle while the install carries on.
   */
  const abort = useCallback(async (): Promise<void> => {
    abortRef.current += 1;
    // Shared in-flight promises belong to the abandoned attempt; a later caller
    // must start its own rather than await a result nobody will act on.
    scanInFlightRef.current = null;
    connectInFlightRef.current = null;
    reconnectInFlightRef.current = null;
    readersFoundRef.current = null;
    setDiscovered([]);
    discoveredRef.current = [];
    setError(null);
    setStatus((prev) => (prev === 'updating' ? prev : connected ? 'ready' : 'idle'));
    await endLiveDiscovery(terminal);
  }, [connected, terminal]);

  return {
    status,
    error,
    discovered,
    connected,
    batteryLevel,
    batteryLow: batteryLevel != null && batteryLevel < LOW_BATTERY_THRESHOLD,
    updateProgress,
    scan,
    connect,
    reconnectRemembered,
    forget,
    abort,
    reset,
  };
}
