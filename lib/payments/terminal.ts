import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Reader } from '@stripe/stripe-terminal-react-native';

import { shouldSimulateCardReaders } from '@/lib/env';
import {
  ensureIosLocationPermission,
  hasIosLocationPermission,
} from '@/lib/payments/card-present-permissions';
import { ensureTerminalLocationId } from '@/lib/payments/connection-token';
import {
  READER_CANCEL_TIMEOUT_MS,
  READER_DISCOVERY_TIMEOUT_MESSAGE,
  READER_DISCOVERY_TIMEOUT_MS,
  READER_TOKEN_TIMEOUT_MESSAGE,
  READER_TOKEN_TIMEOUT_MS,
  TAP_TO_PAY_CONNECT_TIMEOUT_MS,
  withTimeout,
} from '@/lib/payments/reader-timeouts';
import {
  classifyTapToPayError,
  iosOlderThanTapToPayFloor,
  isOsVersionNotSupported,
  tapToPayFailureMessage,
  type TapToPayFailureReason,
} from '@/lib/payments/tap-to-pay-errors';
import {
  androidPermissionMessage,
  ensureTerminalInitialized,
  getTerminalSdk,
  isTerminalInitialized,
  terminalErrorMessage,
  type TerminalHookApi,
} from '@/lib/payments/terminal-sdk';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';

/**
 * Tap to Pay reader lifecycle (Tap to Pay design doc §7.6).
 *
 * On-demand by default: the payment sheet connects when staff ask to collect a
 * card. The one exception is iOS, where Apple requires Tap to Pay on iPhone to be
 * prepared at launch and on every return to the foreground (checklist 1.5, and
 * 5.6's "Tap to Pay UI within one second"). `TapToPayProvider` does that with
 * `connect({ tosAcceptancePermitted: false, promptForPermissions: false })`, so
 * the warm-up can never put Apple's terms or a permission dialog on screen.
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

export type TapToPayConnectOptions = {
  /**
   * iOS: may this connect show Apple's Tap to Pay on iPhone terms if they have not
   * been accepted yet? Omitted = the SDK default (yes). Apple requires that only
   * an admin can accept them (checklist 3.8), so non-admins pass false and get
   * `reason: 'terms_not_accepted'` back instead of the sheet.
   */
  tosAcceptancePermitted?: boolean;
  /**
   * May this connect show a permission dialog? Default true. The launch warm-up
   * passes false and gets `reason: 'permission_needed'` instead.
   */
  promptForPermissions?: boolean;
};

export type TapToPayConnectResult = {
  ok: boolean;
  error: string | null;
  /** Present only when the reason changes what staff are told or offered. */
  reason?: TapToPayFailureReason;
  /** Present (true) when Apple's terms were accepted during this connect. */
  acceptedTerms?: boolean;
};

export interface UseTapToPayReader {
  status: TapToPayStatus;
  error: string | null;
  /** True when this device can do Tap to Pay at all (NFC + OS floor). */
  supported: boolean | null;
  /**
   * iOS is too old for Tap to Pay on iPhone here (Apple's `osVersionNotSupported`).
   * The option stays visible and explains that the merchant needs to update iOS,
   * rather than disappearing without a word (checklist 1.4).
   */
  updateRequired: boolean;
  /**
   * Configuration progress (0–1) while Tap to Pay is being set up on this phone,
   * else null. Apple's `PaymentCardReader.Event.updateProgress`, which the SDK
   * reports through the reader-update events (checklist 3.9.1 / 5.7).
   */
  progress: number | null;
  /**
   * Initialise, discover and connect.
   *
   * Returns the failure reason alongside the flag: callers run this inside an
   * async handler, where reading `error` off the hook straight after awaiting
   * would see the PREVIOUS render's value (always stale, usually null) and
   * silently downgrade a specific, actionable message to a generic one.
   */
  connect: (options?: TapToPayConnectOptions) => Promise<TapToPayConnectResult>;
  /** Re-check device support (cheap; cached after the first answer). */
  checkSupport: () => Promise<boolean>;
  /**
   * Abandon a connect in flight and cancel the SDK's discovery, so staff can get
   * out of a slow prepare and the next attempt starts clean.
   */
  abort: () => Promise<void>;
  reset: () => void;
}

/**
 * Simulated readers so the flow is testable without hardware or a real card.
 * Defaults to `__DEV__`; set `EXPO_PUBLIC_TERMINAL_SIMULATED` to override, which
 * is what lets a dev build talk to real hardware (see `shouldSimulateCardReaders`).
 */
const USE_SIMULATED = shouldSimulateCardReaders();

/**
 * The Tap to Pay connect currently running, shared by EVERY hook instance.
 *
 * Terminal runs one command at a time, and two places connect the phone's reader:
 * the iOS warm-up in `TapToPayProvider` and the payment sheet. Staff tapping "Tap
 * to Pay on iPhone" while the warm-up is still preparing must JOIN it, not start
 * a second discovery that the SDK refuses as busy.
 */
let sharedConnect: { promise: Promise<TapToPayConnectResult> } | null = null;

/**
 * Set by the terms event while a connect runs. The event is global (every
 * mounted hook hears it), so a module flag rather than per-instance state.
 */
let termsAcceptedDuringConnect = false;

/**
 * True while any Tap to Pay connect is running. The reader-update events are
 * global too, and this is how the Bluetooth hook tells the phone's own set-up
 * progress apart from a firmware install on a real reader.
 */
export function isTapToPayConnectInFlight(): boolean {
  return sharedConnect !== null;
}

/**
 * This iPhone needs an iOS update before Tap to Pay on iPhone can work. Module
 * level because it is a fact about the phone: whichever hook learns it (the
 * warm-up's support probe, usually), the payment sheet and Settings must know.
 */
let osUpdateRequired = false;
const osUpdateListeners = new Set<() => void>();

function markOsUpdateRequired(): void {
  if (osUpdateRequired) return;
  osUpdateRequired = true;
  osUpdateListeners.forEach((notify) => notify());
}

/** Test seam: forget any connect left hanging by an earlier case. */
export function __resetTapToPayConnectForTests(): void {
  sharedConnect = null;
  termsAcceptedDuringConnect = false;
  osUpdateRequired = false;
}

export function useTapToPayReader(): UseTapToPayReader {
  const sdk = getTerminalSdk();
  const accessToken = useAccessToken();
  const { ownerVenueId } = useLinkedVenueContext();

  const [status, setStatus] = useState<TapToPayStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [updateRequired, setUpdateRequired] = useState(osUpdateRequired);

  useEffect(() => {
    const notify = () => setUpdateRequired(true);
    osUpdateListeners.add(notify);
    if (osUpdateRequired) notify();
    return () => {
      osUpdateListeners.delete(notify);
    };
  }, []);

  // Resolver for the discovery callback: `discoverReaders` streams results
  // through `onUpdateDiscoveredReaders` rather than returning them.
  const pendingReaderRef = useRef<((reader: Reader.Type) => void) | null>(null);
  const scopeRef = useRef<string | null>(ownerVenueId ?? null);
  /** Discovery in flight, so leaving the sheet can stop it (see cleanup below). */
  const discoveringRef = useRef(false);
  const terminalRef = useRef<TerminalHookApi | null>(null);
  /** The shared connect THIS instance started, so abandoning it can free the slot. */
  const ownedConnectRef = useRef<typeof sharedConnect>(null);

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
    // Setting up Tap to Pay on iPhone reports its progress through the same
    // events as a reader firmware install. They are global, so they only count
    // here while a Tap to Pay connect is actually running.
    onDidStartInstallingUpdate: () => {
      if (sharedConnect) setProgress(0);
    },
    onDidReportReaderSoftwareUpdateProgress: (value: string | number) => {
      if (!sharedConnect) return;
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(n)) setProgress(Math.min(1, Math.max(0, n)));
    },
    onDidFinishInstallingUpdate: () => {
      if (sharedConnect) setProgress(null);
    },
    onDidAcceptTermsOfService: () => {
      termsAcceptedDuringConnect = true;
    },
  });

  useEffect(() => {
    terminalRef.current = terminal;
  }, [terminal]);

  /** Free the shared slot if this instance owns it (abandon/unmount). */
  const releaseOwnedConnect = useCallback(() => {
    if (ownedConnectRef.current && sharedConnect === ownedConnectRef.current) {
      sharedConnect = null;
    }
    ownedConnectRef.current = null;
  }, []);

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
        releaseOwnedConnect();
        void terminalRef.current?.cancelDiscovering().catch(() => {
          // Nothing in flight.
        });
      }
    },
    [releaseOwnedConnect],
  );

  /** Switching linked venue re-scopes the connected account: drop the reader. */
  useEffect(() => {
    const next = ownerVenueId ?? null;
    if (scopeRef.current === next) return;
    scopeRef.current = next;
    setStatus('idle');
    setError(null);
    // Nothing can be connected on an SDK that was never initialised (a venue
    // without in-person payments), and asking would only log an error.
    if (!isTerminalInitialized()) return;
    void terminal.disconnectReader().catch(() => {
      // Best effort: a failure here only means we reconnect on next use.
    });
  }, [ownerVenueId, terminal]);

  const checkSupport = useCallback(async (): Promise<boolean> => {
    try {
      /**
       * `supportsReadersOfType` requires an initialised SDK. Without this the
       * call always came back "First initialize the Stripe Terminal SDK before
       * performing any action", so the device-support gate never actually ran:
       * `supported` stayed unknown and Tap to Pay was offered on every device,
       * including ones that cannot do it (§7A.3).
       */
      const init = await ensureTerminalInitialized(terminal);
      if (!init.ok) return supported === true;
      const res = await terminal.supportsReadersOfType({
        deviceType: 'tapToPay',
        discoveryMethod: 'tapToPay',
        simulated: USE_SIMULATED,
      });
      if (res?.error) {
        // Apple's "OS version not supported": keep the option visible, and say
        // why it cannot be used yet (1.4).
        if (isOsVersionNotSupported(res.error)) {
          markOsUpdateRequired();
          return false;
        }
        // The one error that is a definite "no" about the device itself
        // (`SCPErrorUnsupportedMobileDeviceConfiguration`), rather than a probe
        // that could not answer.
        if (classifyTapToPayError(res.error) === 'device_unsupported') {
          setSupported(false);
          return false;
        }
        // The SDK could not answer (often "not initialised yet"). Leave support
        // UNKNOWN rather than false: a false negative would hide Tap to Pay on a
        // perfectly capable phone, and the connect attempt gives the real answer
        // with a proper message.
        return supported === true;
      }
      const ok = Boolean(res?.readerSupportResult);
      // Below iOS 17.6 a plain "no" is how an out-of-date iOS can show up. Read
      // it as "update iOS" (option stays, with the reason) rather than "this
      // iPhone can't" (option hidden, with no reason at all).
      if (!ok && iosOlderThanTapToPayFloor()) {
        markOsUpdateRequired();
        return false;
      }
      setSupported(ok);
      return ok;
    } catch {
      return supported === true;
    }
  }, [supported, terminal]);

  const connect = useCallback(
    async (options: TapToPayConnectOptions = {}): Promise<TapToPayConnectResult> => {
      setError(null);
      const mayPrompt = options.promptForPermissions !== false;

      /** Record the reason in hook state AND hand it back to the caller. */
      const fail = (message: string, reason?: TapToPayFailureReason): TapToPayConnectResult => {
        setStatus('error');
        setError(message);
        return reason ? { ok: false, error: message, reason } : { ok: false, error: message };
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

      // Known not to work until iOS is updated: say so straight away, without
      // putting the SDK through a connect that can only fail the same way.
      if (Platform.OS === 'ios' && osUpdateRequired) {
        return fail(tapToPayFailureMessage('os_update_required', true), 'os_update_required');
      }

      // Another connect is already running (the iOS warm-up, or a double tap):
      // join it rather than starting a second one the SDK refuses as busy. Run a
      // fresh attempt afterwards only when this caller may do what that one was
      // not allowed to — show Apple's terms, or ask for a permission.
      if (sharedConnect) {
        setStatus('connecting');
        const joined = await sharedConnect.promise;
        const mayDoMore =
          (joined.reason === 'terms_not_accepted' && options.tosAcceptancePermitted !== false) ||
          (joined.reason === 'permission_needed' && mayPrompt);
        if (!mayDoMore) {
          if (joined.ok) {
            setStatus('ready');
          } else {
            setStatus('error');
            setError(joined.error);
          }
          return joined;
        }
      }

      if (existing) {
        // Terminal holds one reader at a time, so free it before connecting ours.
        await terminal.disconnectReader().catch(() => {
          // If it was already gone, connecting below still works.
        });
      }

      const attempt = async (): Promise<TapToPayConnectResult> => {
        try {
          setStatus('initializing');

          // Every await from here to "the client can tap" is time-boxed: an
          // unbounded one leaves the sheet on "Getting the card reader ready" with
          // nothing to press (see reader-timeouts.ts). This one is bounded, and
          // de-duplicated against the support probe, inside
          // `ensureTerminalInitialized`.
          const init = await ensureTerminalInitialized(terminal);
          if (!init.ok) {
            return fail(init.error ?? 'Could not start the card reader.');
          }

          // Android needs runtime location permission before discovery.
          if (Platform.OS === 'android' && sdk?.requestNeededAndroidPermissions) {
            if (!mayPrompt) {
              return fail(tapToPayFailureMessage('permission_needed', true), 'permission_needed');
            }
            const granted = await sdk.requestNeededAndroidPermissions({
              accessFineLocation: {
                title: 'Location permission',
                message: 'Location is required to accept in-person card payments.',
                buttonPositive: 'Allow',
              },
            });
            // Judge `error`'s VALUE: the helper always returns an object with an
            // `error` key and nulls it on success.
            const refused = androidPermissionMessage(granted);
            if (refused) return fail(refused);
          }
          // The iOS half, which the Bluetooth path needs too. The warm-up may not
          // prompt: a location dialog appearing as the app opens is exactly what
          // this layer has always avoided.
          if (mayPrompt) {
            const iosRefused = await ensureIosLocationPermission();
            if (iosRefused) return fail(iosRefused);
          } else if (!(await hasIosLocationPermission())) {
            return fail(tapToPayFailureMessage('permission_needed', true), 'permission_needed');
          }

          const locationId = await withTimeout(
            ensureTerminalLocationId({ accessToken, ownerVenueId: ownerVenueId ?? null }),
            READER_TOKEN_TIMEOUT_MS,
            READER_TOKEN_TIMEOUT_MESSAGE,
          );

          setStatus('discovering');
          /**
           * The reader arrives on the discovery callback, so this promise is what
           * the attempt actually waits on. Its bound is `withTimeout` below rather
           * than a timer paired with the resolver: the old paired timer only fired
           * while THIS attempt still owned `pendingReaderRef`, so anything that
           * cleared the ref first (a retry, or now `abort`) left this await
           * hanging for ever — and with it the caller's `startingRef` guard,
           * killing Retry.
           */
          const readerPromise = new Promise<Reader.Type>((resolve) => {
            pendingReaderRef.current = resolve;
          });

          discoveringRef.current = true;
          const discovery = await withTimeout(
            terminal.discoverReaders({ discoveryMethod: 'tapToPay', simulated: USE_SIMULATED }),
            READER_DISCOVERY_TIMEOUT_MS,
            READER_DISCOVERY_TIMEOUT_MESSAGE,
          );
          discoveringRef.current = false;
          if (discovery?.error) {
            pendingReaderRef.current = null;
            if (isOsVersionNotSupported(discovery.error)) {
              markOsUpdateRequired();
              return fail(tapToPayFailureMessage('os_update_required', true), 'os_update_required');
            }
            return fail(terminalErrorMessage(discovery.error, 'Could not find a card reader.'));
          }

          const reader = await withTimeout(
            readerPromise,
            READER_DISCOVERY_TIMEOUT_MS,
            'No card reader became available on this phone.',
          );
          pendingReaderRef.current = null;

          setStatus('connecting');
          const connected = await withTimeout(
            terminal.connectReader({
              discoveryMethod: 'tapToPay',
              reader,
              locationId,
              // iOS only: Android has no terms step, and the option is an iOS
              // connection-configuration field.
              ...(Platform.OS === 'ios' && options.tosAcceptancePermitted !== undefined
                ? { tosAcceptancePermitted: options.tosAcceptancePermitted }
                : {}),
            }),
            TAP_TO_PAY_CONNECT_TIMEOUT_MS,
            'The card reader did not finish starting up. Try again.',
          );
          if (connected?.error) {
            const reason = classifyTapToPayError(connected.error);
            if (reason === 'os_update_required') markOsUpdateRequired();
            return reason
              ? fail(tapToPayFailureMessage(reason, options.tosAcceptancePermitted !== false), reason)
              : fail(terminalErrorMessage(connected.error, 'Could not connect the card reader.'));
          }

          setStatus('ready');
          return termsAcceptedDuringConnect
            ? { ok: true, error: null, acceptedTerms: true }
            : { ok: true, error: null };
        } catch (e) {
          discoveringRef.current = false;
          return fail(e instanceof Error ? e.message : 'Could not start the card reader.');
        }
      };

      termsAcceptedDuringConnect = false;
      const entry = { promise: attempt() };
      sharedConnect = entry;
      ownedConnectRef.current = entry;
      try {
        return await entry.promise;
      } finally {
        if (sharedConnect === entry) sharedConnect = null;
        if (ownedConnectRef.current === entry) ownedConnectRef.current = null;
        setProgress(null);
      }
    },
    [accessToken, ownerVenueId, sdk, terminal],
  );

  const reset = useCallback(() => {
    pendingReaderRef.current = null;
    setStatus('idle');
    setError(null);
  }, []);

  /**
   * Staff cancelled a prepare that was taking too long. As well as resetting, the
   * SDK's discovery has to be cancelled: an abandoned one is refused-as-busy the
   * next time, so leaving it running would break the retry as well.
   */
  const abort = useCallback(async (): Promise<void> => {
    pendingReaderRef.current = null;
    setStatus('idle');
    setError(null);
    setProgress(null);
    releaseOwnedConnect();
    if (discoveringRef.current) {
      discoveringRef.current = false;
      await withTimeout(
        terminal.cancelDiscovering(),
        READER_CANCEL_TIMEOUT_MS,
        'Could not stop looking for a card reader.',
      ).catch(() => {
        // Nothing was discovering, or the SDK never confirmed. Either way the
        // attempt is abandoned and the next one re-discovers.
      });
    }
  }, [releaseOwnedConnect, terminal]);

  return {
    status,
    error,
    supported,
    updateRequired,
    progress,
    connect,
    checkSupport,
    abort,
    reset,
  };
}
