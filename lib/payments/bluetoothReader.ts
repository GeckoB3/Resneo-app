import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Reader } from '@stripe/stripe-terminal-react-native';

import { ensureTerminalLocationId } from '@/lib/payments/connection-token';
import {
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
  reset: () => void;
}

const USE_SIMULATED = __DEV__;

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
  /** True while a Bluetooth scan is running, for the unmount cleanup below. */
  const discoveringRef = useRef(false);
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
    },
    onDidStartInstallingUpdate: () => {
      setUpdateProgress(0);
      setStatus('updating');
    },
    onDidReportReaderSoftwareUpdateProgress: (progress: string | number) => {
      const value = typeof progress === 'number' ? progress : Number(progress);
      if (Number.isFinite(value)) setUpdateProgress(value);
    },
    onDidFinishInstallingUpdate: () => {
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
      if (discoveringRef.current) {
        discoveringRef.current = false;
        void terminalRef.current?.cancelDiscovering().catch(() => {
          // Nothing was discovering after all.
        });
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
    const init = await ensureTerminalInitialized(terminal);
    if (!init.ok) {
      throw new Error(init.error ?? 'Could not start the card reader.');
    }
    if (Platform.OS === 'android' && sdk?.requestNeededAndroidPermissions) {
      await sdk.requestNeededAndroidPermissions({
        accessFineLocation: {
          title: 'Location permission',
          message: 'Location is required to connect to your card reader.',
          buttonPositive: 'Allow',
        },
      });
    }
    return ensureTerminalLocationId({ accessToken, ownerVenueId: ownerVenueId ?? null });
  }, [accessToken, ownerVenueId, sdk, terminal]);

  const scan = useCallback(async (): Promise<void> => {
    setError(null);
    setDiscovered([]);
    discoveredRef.current = [];
    try {
      await prepare();
      setStatus('scanning');
      discoveringRef.current = true;
      const res = await terminal.discoverReaders({
        discoveryMethod: 'bluetoothScan',
        simulated: USE_SIMULATED,
      });
      discoveringRef.current = false;
      if (res?.error) {
        setStatus('error');
        setError(terminalErrorMessage(res.error, 'Could not search for card readers.'));
        return;
      }
      // Discovery finished: if nothing arrived, say so rather than spin.
      setStatus(discoveredRef.current.length > 0 ? 'found' : 'error');
      if (discoveredRef.current.length === 0) {
        setError('No card readers found. Check the reader is switched on and nearby.');
      }
    } catch (e) {
      discoveringRef.current = false;
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not search for card readers.');
    }
  }, [prepare, terminal]);

  const connect = useCallback(
    async (reader: Reader.Type): Promise<boolean> => {
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
        const res = await terminal.connectReader({
          discoveryMethod: 'bluetoothScan',
          reader,
          locationId,
        });
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
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Could not connect to the card reader.');
        return false;
      }
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
    let serial: string | null = null;
    try {
      serial = await SecureStore.getItemAsync(serialStorageKey(ownerVenueId ?? null));
    } catch {
      serial = null;
    }
    if (!serial) return false;

    await scan();
    const match = discoveredRef.current.find((r) => r.serialNumber === serial);
    if (!match) return false;
    return connect(match);
  }, [connect, ownerVenueId, scan]);

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
    reset,
  };
}
