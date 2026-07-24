import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Reader } from '@stripe/stripe-terminal-react-native';

import { ensureTerminalLocationId } from '@/lib/payments/connection-token';
import { getTerminalSdk, terminalErrorMessage } from '@/lib/payments/terminal-sdk';
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
  /** Initialise, discover and connect. Resolves true when a reader is ready. */
  connect: () => Promise<boolean>;
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
  const initializedRef = useRef(false);
  const scopeRef = useRef<string | null>(ownerVenueId ?? null);

  // `useStripeTerminal` must be called unconditionally. The SDK object is
  // process-stable (cached in terminal-sdk.ts), and this hook is only mounted
  // when it is non-null, so the call order never varies for a given instance.
  const terminal = sdk!.useStripeTerminal({
    onUpdateDiscoveredReaders: (readers: Reader.Type[]) => {
      const first = readers[0];
      if (first && pendingReaderRef.current) {
        const resolve = pendingReaderRef.current;
        pendingReaderRef.current = null;
        resolve(first);
      }
    },
  });

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

  const connect = useCallback(async (): Promise<boolean> => {
    setError(null);

    // Already connected from a previous payment in this session.
    if (terminal.connectedReader) {
      setStatus('ready');
      return true;
    }

    try {
      setStatus('initializing');

      if (!initializedRef.current) {
        const init = await terminal.initialize();
        if (init?.error) {
          setStatus('error');
          setError(terminalErrorMessage(init.error, 'Could not start the card reader.'));
          return false;
        }
        initializedRef.current = true;
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
          setStatus('error');
          setError('Location permission is needed to take card payments.');
          return false;
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
          if (pendingReaderRef.current) {
            pendingReaderRef.current = null;
            reject(new Error('No card reader became available on this phone.'));
          }
        }, 30_000);
      });

      const discovery = await terminal.discoverReaders({
        discoveryMethod: 'tapToPay',
        simulated: USE_SIMULATED,
      });
      if (discovery?.error) {
        pendingReaderRef.current = null;
        setStatus('error');
        setError(terminalErrorMessage(discovery.error, 'Could not find a card reader.'));
        return false;
      }

      const reader = await readerPromise;

      setStatus('connecting');
      const connected = await terminal.connectReader({
        discoveryMethod: 'tapToPay',
        reader,
        locationId,
      });
      if (connected?.error) {
        setStatus('error');
        setError(terminalErrorMessage(connected.error, 'Could not connect the card reader.'));
        return false;
      }

      setStatus('ready');
      return true;
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not start the card reader.');
      return false;
    }
  }, [accessToken, ownerVenueId, sdk, terminal]);

  const reset = useCallback(() => {
    pendingReaderRef.current = null;
    setStatus('idle');
    setError(null);
  }, []);

  return { status, error, supported, connect, checkSupport, reset };
}
