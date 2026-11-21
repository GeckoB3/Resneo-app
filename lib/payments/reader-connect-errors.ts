/**
 * How a Bluetooth card reader's connect and scan errors are read: which ones are worth one quiet
 * retry, and what staff are told for the rest.
 *
 * WHY THIS EXISTS (owner, 21 Nov 2026): switching a reader on and connecting straight away failed
 * with an error, and going back a step and trying again usually worked. A Stripe Bluetooth reader
 * starts advertising while it is still booting, so the scan lists it a moment before it can accept
 * a connection, and the first handshake fails with a Bluetooth or timeout error. Nothing in the app
 * retried, so staff saw the error and had to start again by hand.
 *
 * The codes are the React Native SDK's unified ones (0.0.1-beta.33): iOS maps
 * `bluetoothConnectTimedOut` to `REQUEST_TIMED_OUT`, `bluetoothPeerRemovedPairingInformation` to
 * `BLUETOOTH_ERROR`, and `bluetoothDisabled` / `bluetoothAccessDenied` to
 * `BLUETOOTH_PERMISSION_DENIED` (`ios/Errors.swift`); Android passes its `TerminalErrorCode`
 * names straight through (`Errors.kt`).
 */
import type { StripeError } from '@stripe/stripe-terminal-react-native';

import { terminalErrorMessage } from '@/lib/payments/terminal-sdk';

/** How many times one tap tries to connect, counting the first. */
export const READER_CONNECT_ATTEMPTS = 3;

/** The pause before a retry, multiplied by the retry number (2s, then 4s). */
export const READER_CONNECT_RETRY_DELAY_MS = 2_000;

/**
 * No new attempt starts once this long has passed since the tap. A connect that times out on the
 * Bluetooth side can take many seconds itself, and a client is waiting at the counter.
 */
export const READER_CONNECT_RETRY_WINDOW_MS = 45_000;

/** How long a silent reconnect waits for the remembered reader once the scan is running. */
export const READER_REMEMBERED_WAIT_MS = 10_000;

/** Shown while a quiet retry is running, in place of an error. */
export const READER_STARTING_UP_MESSAGE = 'Your reader is still starting up. Trying again.';

/** Shown when every attempt failed on an error a retry could have fixed. */
export const READER_CONNECT_FAILED_MESSAGE =
  'The reader did not connect. Make sure it is switched on, charged and close to this phone, then try again.';

/**
 * Errors from a reader that is not ready yet, or a Bluetooth link that dropped mid-handshake.
 * Each one is worth a short wait and another go.
 */
const TRANSIENT_CODES = new Set<string>([
  'BLUETOOTH_ERROR',
  'BLUETOOTH_DISCONNECTED',
  'REQUEST_TIMED_OUT',
  'READER_BUSY',
  'READER_COMMUNICATION_ERROR',
  'GENERIC_READER_ERROR',
  'STRIPE_API_CONNECTION_ERROR',
  'UNEXPECTED_SDK_ERROR',
]);

function codeOf(error: StripeError | { code?: unknown } | null | undefined): string | null {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : null;
}

function messageOf(error: StripeError | { message?: unknown } | null | undefined): string {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' ? message : '';
}

/**
 * Is this connect failure worth one more quiet try?
 *
 * Also true for the SDK's "Could not find reader" (`INVALID_REQUIRED_PARAMETER`), which is what a
 * reader object from an older scan gets: the retry connects with the reader from a fresh scan.
 * Never true for a refusal a retry cannot change (battery critically low, paired with another
 * phone, permissions, the business's own set-up, a failed update, staff cancelling).
 */
export function isTransientReaderConnectError(error: StripeError | null | undefined): boolean {
  const code = codeOf(error);
  if (code && TRANSIENT_CODES.has(code)) return true;
  if (code === 'INVALID_REQUIRED_PARAMETER' && /could not find (a )?reader/i.test(messageOf(error))) {
    return true;
  }
  return false;
}

/** Did the SDK refuse because a reader is already connected? */
export function isAlreadyConnectedError(error: StripeError | null | undefined): boolean {
  return codeOf(error) === 'ALREADY_CONNECTED_TO_READER';
}

/**
 * What staff are told when a Bluetooth scan or connect fails, in plain words. Codes Stripe words
 * technically, or where the fix is somewhere staff would not think to look, get our own sentence;
 * anything else keeps `terminalErrorMessage` (which also explains connection-token failures).
 */
export function readerErrorMessage(
  error: StripeError | null | undefined,
  fallback: string,
  /** For an error a retry could fix. A scan passes its own "no readers found" sentence. */
  transientMessage: string = READER_CONNECT_FAILED_MESSAGE,
): string {
  switch (codeOf(error)) {
    case 'BLUETOOTH_PERMISSION_DENIED':
      return 'Bluetooth is off, or Resneo is not allowed to use it. Turn Bluetooth on and allow Resneo in your phone settings, then try again.';
    case 'LOCATION_SERVICES_DISABLED':
      return 'Location is turned off on this phone, and card readers need it. Turn it on in your phone settings, then try again.';
    case 'BLUETOOTH_LOW_ENERGY_UNSUPPORTED':
      return 'This phone cannot connect to Bluetooth card readers.';
    case 'READER_BATTERY_CRITICALLY_LOW':
      return 'The reader battery is too low to connect. Charge it for a few minutes, then try again.';
    case 'READER_SOFTWARE_UPDATE_FAILED_BATTERY_LOW':
      return 'Your reader needs an update, and its battery is too low to install it. Charge it to over half, then try again.';
    case 'READER_SOFTWARE_UPDATE_FAILED':
    case 'READER_SOFTWARE_UPDATE_FAILED_INTERRUPTED':
    case 'READER_SOFTWARE_UPDATE_FAILED_READER_ERROR':
    case 'READER_SOFTWARE_UPDATE_FAILED_SERVER_ERROR':
      return 'Your reader’s update did not finish. Keep it switched on and close to this phone, then try again.';
    case 'READER_CONNECTED_TO_ANOTHER_DEVICE':
      return 'This reader is connected to another phone or tablet. Disconnect it there, or switch the reader off and on, then try again.';
    default:
      break;
  }
  if (isTransientReaderConnectError(error)) return transientMessage;
  return terminalErrorMessage(error ?? undefined, fallback);
}
