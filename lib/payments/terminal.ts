import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
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
 * Tap to Pay reader lifecycle (Tap to Pay design doc §7.6).
 *
 * LAZY BY DESIGN: nothing here runs until the staff member actually opens the
 * payment sheet and asks to collect a card. Initialising Terminal is heavy and
 * triggers permission prompts, so it must never happen on app launch.
 *
 * IMPORTANT: this hook calls into the Terminal SDK, so it may only be used by a
 * component that is mounted ONLY when {@link isTerminalSdkAvailable} is true and
 * the app is inside `TerminalProvider`. `TakePaymentSheet` enforces that by
 * rendering its card section conditionally.
 */

/** Reader connection status surfaced to the sheet (§7.6). */
export type TapToPayStatus =
  | 'idle'
  | 'initializing'
  | 'discovering'
  | 'connecting'
  | 'ready'
  | 'error';

export interface UseTapToPayReader {
  status: TapToPayStatus;
  error: string | null;
  /** True when this device can do Tap to Pay at all (NFC + OS floor). */
  supported: boolean | null;
  /**
   * Initialise, discover and connect.
   *
   * Returns the failure reason alongside the flag: callers run this inside an
   * async handler, where reading `error` off the hook straight after awaiting
   * would see the PREVIOUS render's value (always stale, usually null) and
   * silently downgrade a specific, actionable message to a generic one.
   */
  connect: () => Promise<{ ok: boolean; error: string | null }>;
  /** Re-check device support (cheap; cached after the first answer). */
  checkSupport: () => Promise<boolean>;
  reset: () => void;
}

/** Simulated readers in dev builds so the flow is testable without a real card. */
const USE_SIMULATED = __DEV__;

export function useTapToPayReader(): UseTapToPayReader {
  const sdk = getTerminalSdk();
  const accessToken = useAccessToken();
  const { ownerVenueId } = useLinkedVenueContext();

  const [status, setStatus] = useState<TapToPayStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);

  // Resolver for the discovery callback: `discoverReaders` streams results
  // through `onUpdateDiscoveredReaders` rather than returning them.
  const pendingReaderRef = useRef<((reader: Reader.Type) => void) | null>(null);
  const scopeRef = useRef<string | null>(ownerVenueId ?? null);
  /** Discovery in flight, so leaving the sheet can stop it (see cleanup below). */
  const discoveringRef = useRef(false);
  const terminalRef = useRef<TerminalHookApi | null>(null);

  // `useStripeTerminal` must be called unconditionally. The SDK object is
  // process-stable (cached in terminal-sdk.ts), and this hook is only mounted
  // when it is non-null, so the call order never varies for a given instance.
  const terminal = sdk!.useStripeTerminal({
    onUpdateDiscoveredReaders: (readers: Reader.Type[]) => {
      // Discovery events are GLOBAL: every mounted hook with this callback sees
      // them, and the payment sheet mounts the Tap to Pay and Bluetooth hooks
      // together. Take only the phone's own reader here so a Bluetooth scan can
      // never satisfy a Tap to Pay connect (and vice versa in the BT hook).
      const local = readers.find((r) => r.deviceType === 'tapToPay') ?? null;
      if (local && pendingReaderRef.current) {
        const resolve = pendingReaderRef.current;
        pendingReaderRef.current = null;
        resolve(local);
      }
    },
  });

  useEffect(() => {
    terminalRef.current = terminal;
  }, [terminal]);

  /**
   * Abandoning the sheet mid-discovery must stop it: the SDK will not start a
   * new discovery while one is running, so a stale scan would break the next
   * payment attempt.
   */
  useEffect(
    () => () => {
      pendingReaderRef.current = null;
      if (discoveringRef.current) {
        discoveringRef.current = false;
        void terminalRef.current?.cancelDiscovering().catch(() => {
          // Nothing in flight.
        });
      }
    },
    [],
  );

  /** Switching linked venue re-scopes the connected account: drop the reader. */
  useEffect(() => {
    const next = ownerVenueId ?? null;
    if (scopeRef.current === next) return;
    scopeRef.current = next;
    setStatus('idle');
    setError(null);
    void terminal.disconnectReader().catch(() => {
      // Best effort: a failure here only means we reconnect on next use.
    });
  }, [ownerVenueId, terminal]);

  const checkSupport = useCallback(async (): Promise<boolean> => {
    try {
      const res = await terminal.supportsReadersOfType({
        deviceType: 'tapToPay',
        discoveryMethod: 'tapToPay',
        simulated: USE_SIMULATED,
      });
      if (res?.error) {
        // The SDK could not answer (often "not initialised yet"). Leave support
        // UNKNOWN rather than false: a false negative would hide Tap to Pay on a
        // perfectly capable phone, and the connect attempt gives the real answer
        // with a proper message.
        return supported === true;
      }
      const ok = Boolean(res?.readerSupportResult);
      setSupported(ok);
      return ok;
    } catch {
      return supported === true;
    }
  }, [supported, terminal]);

  const connect = useCallback(async (): Promise<{ ok: boolean; error: string | null }> => {
    setError(null);

    /** Record the reason in hook state AND hand it back to the caller. */
    const fail = (reason: string) => {
      setStatus('error');
      setError(reason);
      return { ok: false, error: reason };
    };

    // Already connected from a previous payment in this session — but ONLY
    // reuse the phone's own reader. A Bluetooth reader may be connected from an
    // earlier payment; collecting through it after the staff member chose "Tap
    // to Pay on this phone" would use the wrong device and mislabel the ledger
    // row's reader_type.
    const existing = terminal.connectedReader;
    if (existing?.deviceType === 'tapToPay') {
      setStatus('ready');
      return { ok: true, error: null };
    }
    if (existing) {
      // Terminal holds one reader at a time, so free it before connecting ours.
      await terminal.disconnectReader().catch(() => {
        // If it was already gone, connecting below still works.
      });
    }

    try {
      setStatus('initializing');

      const init = await ensureTerminalInitialized(terminal);
      if (!init.ok) {
        return fail(init.error ?? 'Could not start the card reader.');
      }

      // Android needs runtime location permission before discovery.
      if (Platform.OS === 'android' && sdk?.requestNeededAndroidPermissions) {
        const granted = await sdk.requestNeededAndroidPermissions({
          accessFineLocation: {
            title: 'Location permission',
            message: 'Location is required to accept in-person card payments.',
            buttonPositive: 'Allow',
          },
        });
        // The helper resolves with an error-shaped object when denied.
        if (granted && typeof granted === 'object' && 'error' in granted) {
          return fail('Location permission is needed to take card payments.');
        }
      }

      const locationId = await ensureTerminalLocationId({
        accessToken,
        ownerVenueId: ownerVenueId ?? null,
      });

      setStatus('discovering');
      const readerPromise = new Promise<Reader.Type>((resolve, reject) => {
        pendingReaderRef.current = resolve;
        // Tap to Pay resolves its local reader almost immediately; a stall means
        // something is wrong (permissions, ineligible device) so fail loudly
        // rather than leaving staff on a spinner.
        setTimeout(() => {
          // Only cancel if THIS attempt is still the pending one. A retry
          // started before the old timer fired would otherwise have its
          // resolver cleared and hang until its own timeout.
          if (pendingReaderRef.current === resolve) {
            pendingReaderRef.current = null;
            reject(new Error('No card reader became available on this phone.'));
          }
        }, 30_000);
      });

      discoveringRef.current = true;
      const discovery = await terminal.discoverReaders({
        discoveryMethod: 'tapToPay',
        simulated: USE_SIMULATED,
      });
      discoveringRef.current = false;
      if (discovery?.error) {
        pendingReaderRef.current = null;
        return fail(terminalErrorMessage(discovery.error, 'Could not find a card reader.'));
      }

      const reader = await readerPromise;

      setStatus('connecting');
      const connected = await terminal.connectReader({
        discoveryMethod: 'tapToPay',
        reader,
        locationId,
      });
      if (connected?.error) {
        return fail(terminalErrorMessage(connected.error, 'Could not connect the card reader.'));
      }

      setStatus('ready');
      return { ok: true, error: null };
    } catch (e) {
      discoveringRef.current = false;
      return fail(e instanceof Error ? e.message : 'Could not start the card reader.');
    }
  }, [accessToken, ownerVenueId, sdk, terminal]);

  const reset = useCallback(() => {
    pendingReaderRef.current = null;
    setStatus('idle');
    setError(null);
  }, []);

  return { status, error, supported, connect, checkSupport, reset };
}
