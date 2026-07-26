/**
 * Lazy, crash-proof access to `@stripe/stripe-terminal-react-native`.
 *
 * WHY THIS EXISTS (do not replace with a plain top-level import):
 * the SDK executes native-module work at IMPORT time — its `useListener`
 * module builds `new NativeEventEmitter(NativeModules.StripeTerminalReactNative)`
 * at module scope, and its logger requires a package-relative file. Importing it
 * anywhere Metro/Jest can reach without the native module present throws
 * outright (verified: a bare `require` throws under Jest). A throw at import
 * time would take down the whole app for EVERY venue, including the ones that
 * never enable in-person payments, which directly violates the frictionless-off
 * requirement (Tap to Pay design doc §1.3/§3.2).
 *
 * So: every access goes through {@link getTerminalSdk}, which requires the
 * module on first use inside a try/catch and caches the result. Callers treat
 * `null` as "in-person payments are unavailable on this build" and render
 * nothing — exactly the same surface a non-enabled venue sees.
 *
 * Type-only imports are erased at compile time, so importing TYPES from the SDK
 * elsewhere is safe; importing VALUES is not.
 */

import type {
  ConnectReaderParams,
  DiscoverReadersParams,
  PaymentIntent,
  Reader,
  StripeError,
} from '@stripe/stripe-terminal-react-native';
import type { ComponentType, ReactNode } from 'react';

/** The subset of the SDK surface this app uses (docs §7.6, §7.7, §7A.5). */
export interface TerminalSdkModule {
  StripeTerminalProvider: ComponentType<{
    children: ReactNode;
    tokenProvider: () => Promise<string>;
    logLevel?: 'none' | 'verbose' | 'error' | 'warning';
  }>;
  useStripeTerminal: (props?: Record<string, unknown>) => TerminalHookApi;
  /**
   * Android runtime permissions. Returns `{ error: null }` when everything was
   * granted, or `{ error: { '<permission>': '<status>' } }` naming the FIRST
   * one refused. It is always an object with an `error` key, so the result must
   * be judged on `error`'s value, never on key presence (see
   * `androidPermissionMessage`).
   *
   * On Android 12+ it also requests BLUETOOTH_CONNECT and BLUETOOTH_SCAN, for
   * the Tap to Pay path as well as the reader path.
   */
  requestNeededAndroidPermissions?: (opts?: {
    accessFineLocation?: { title: string; message: string; buttonPositive: string };
  }) => Promise<{ error?: Record<string, string> | null }>;
}

/** Result envelope shared by most SDK calls: `{ error? }` rather than throwing. */
interface SdkResult {
  error?: StripeError;
}

/** The methods + state we consume from `useStripeTerminal()`. */
export interface TerminalHookApi {
  initialize: () => Promise<{ error?: StripeError; reader?: Reader.Type }>;
  discoverReaders: (params: DiscoverReadersParams) => Promise<SdkResult>;
  cancelDiscovering: () => Promise<SdkResult>;
  connectReader: (params: ConnectReaderParams) => Promise<SdkResult & { reader?: Reader.Type }>;
  disconnectReader: () => Promise<SdkResult>;
  retrievePaymentIntent: (
    clientSecret: string,
  ) => Promise<SdkResult & { paymentIntent?: PaymentIntent.Type }>;
  collectPaymentMethod: (params: {
    paymentIntent: PaymentIntent.Type;
  }) => Promise<SdkResult & { paymentIntent?: PaymentIntent.Type }>;
  confirmPaymentIntent: (params: {
    paymentIntent: PaymentIntent.Type;
  }) => Promise<SdkResult & { paymentIntent?: PaymentIntent.Type }>;
  cancelCollectPaymentMethod: () => Promise<SdkResult>;
  supportsReadersOfType: (params: {
    deviceType: Reader.DeviceType;
    discoveryMethod: Reader.DiscoveryMethod;
    simulated?: boolean;
  }) => Promise<{ error?: StripeError; readerSupportResult?: boolean }>;
  connectedReader?: Reader.Type | null;
  discoveredReaders?: Reader.Type[];
}

/** Cached module (or the sentinel that loading was tried and failed). */
let cached: TerminalSdkModule | null | undefined;

/**
 * The Terminal SDK, or null when it cannot be loaded on this build (Expo Go,
 * web preview, Jest, or a native build predating the dependency). Never throws.
 */
export function getTerminalSdk(): TerminalSdkModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate lazy require; see file header
    const mod = require('@stripe/stripe-terminal-react-native') as Partial<TerminalSdkModule>;
    cached =
      mod && typeof mod.useStripeTerminal === 'function' && mod.StripeTerminalProvider
        ? (mod as TerminalSdkModule)
        : null;
  } catch {
    // Expected on any build without the native module — not an error worth logging
    // on every call; the caller degrades to "no in-person payment surface".
    cached = null;
  }
  return cached;
}

/** True when the Terminal SDK can be used on this build. */
export function isTerminalSdkAvailable(): boolean {
  return getTerminalSdk() !== null;
}

/** Test seam: forget the cached module so a suite can re-stub it. */
export function __resetTerminalSdkForTests(): void {
  cached = undefined;
}

/**
 * `initialize()` exactly once per app run, shared by the Tap to Pay and
 * Bluetooth hooks.
 *
 * Both hooks can be mounted at once and each needs the SDK initialised, but
 * calling `initialize()` again on an already-initialised SDK can come back as
 * an error envelope. Treating that as a genuine failure would abort the second
 * caller's scan or connect, so the result is remembered and re-used.
 */
let initialized = false;

export async function ensureTerminalInitialized(
  terminal: Pick<TerminalHookApi, 'initialize'>,
): Promise<{ ok: boolean; error: string | null }> {
  if (initialized) return { ok: true, error: null };
  const res = await terminal.initialize();
  if (res?.error) {
    return { ok: false, error: terminalErrorMessage(res.error, 'Could not start the card reader.') };
  }
  initialized = true;
  return { ok: true, error: null };
}

/** Test seam: forget the initialised flag. */
export function __resetTerminalInitForTests(): void {
  initialized = false;
}

/**
 * Turn the Android permission result into a message, or null when everything
 * needed was granted.
 *
 * TWO bugs lived here. First, the caller tested `'error' in result`, which is
 * key presence: the SDK ALWAYS returns an object carrying an `error` key and
 * sets it to `null` on success, so the check was true even when every permission
 * was granted and Tap to Pay could never work on Android. Judge `error`'s value.
 *
 * Second, every failure was reported as a location problem. On Android 12+ the
 * SDK also requires BLUETOOTH_CONNECT and BLUETOOTH_SCAN (granted under "Nearby
 * devices"), for Tap to Pay as much as for a reader, and the returned key says
 * which one was refused. Blaming location sent staff to the wrong setting.
 *
 * The messages name the app settings on purpose: after two refusals Android
 * stops prompting and resolves denied immediately, so "permission is needed" on
 * its own leaves no way forward.
 */
export function androidPermissionMessage(
  result: { error?: Record<string, string> | null } | null | undefined,
): string | null {
  const error = result?.error;
  if (!error || Object.keys(error).length === 0) return null;
  const refused = Object.keys(error).join(' ');
  if (refused.includes('BLUETOOTH')) {
    return 'Nearby devices permission is needed to connect to a card reader. Turn it on for Resneo in your phone app settings.';
  }
  return 'Location permission is needed to take card payments. Turn it on for Resneo in your phone app settings.';
}

/** Human-readable message from an SDK error envelope, with a safe fallback. */
export function terminalErrorMessage(error: StripeError | undefined, fallback: string): string {
  if (!error) return fallback;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}
