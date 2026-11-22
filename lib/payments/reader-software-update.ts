/**
 * Optional software updates for a Bluetooth card reader (21 Nov review, READER-8).
 *
 * WHY THIS EXISTS: Stripe tells the app when a connected reader has an optional update
 * (`onDidReportAvailableUpdate`), and the app never offered it. An update that is never installed
 * becomes REQUIRED on the date Stripe sets, and a required update installs inside `connectReader`,
 * so staff first met it as a payment blocked for minutes with the client waiting. Reader settings
 * now offers it ahead of time. It is never offered or started from the payment sheet or Save card.
 *
 * MODULE-LEVEL on purpose, like the live discovery in `bluetoothReader.ts`: the reader hook is
 * mounted several times (payment sheet collect and pairing steps, Save card, POS, Reader settings),
 * the SDK's events are global, and an install keeps running after Reader settings closes. Every
 * instance has to see the same offer and the same install, so the payment sheet can say "updating"
 * instead of failing. `TerminalProvider` feeds the events in (`readerUpdateSdkCallbacks`) from a
 * listener that is always mounted, so an install that finishes with every sheet closed still lands.
 *
 * SDK facts (0.0.1-beta.33, checked in node_modules): `installAvailableUpdate()` resolves at once
 * on both platforms (`resolve([:])` / `promise.resolve(...)` straight after the native call), and
 * the install reports through `onDidStartInstallingUpdate`, `onDidReportReaderSoftwareUpdateProgress`
 * (a 0-1 number sent as a string) and `onDidFinishInstallingUpdate({ update } | { error })`. Only
 * mobile (Bluetooth) readers send `didReportAvailableUpdate`; Tap to Pay never does. The connected
 * reader object also carries `availableUpdate`.
 */
import { useSyncExternalStore } from 'react';
import type { Reader, StripeError } from '@stripe/stripe-terminal-react-native';

/**
 * Battery a reader needs to install an update. Stripe's reader docs set the bar at 50%; below it
 * the SDK fails the install with `READER_SOFTWARE_UPDATE_FAILED_BATTERY_LOW`.
 */
export const READER_UPDATE_MIN_BATTERY = 0.5;

/** If the reader has not started installing this long after staff tapped Install, say so. */
export const READER_UPDATE_START_TIMEOUT_MS = 60_000;

export const READER_UPDATE_OFFER_MESSAGE =
  'An update is ready for your reader. Install now (takes a few minutes).';
export const READER_UPDATE_INSTALLING_MESSAGE =
  'Updating your reader. Keep it switched on and near this phone.';
export const READER_UPDATE_DONE_MESSAGE = 'Your reader is up to date.';
export const READER_UPDATE_FAILED_MESSAGE =
  'The update did not finish. Keep your reader switched on and near this phone, then try again.';
export const READER_UPDATE_NOT_STARTED_MESSAGE =
  'The update did not start. Keep your reader switched on and near this phone, then try again.';
export const READER_UPDATE_DISCONNECTED_MESSAGE =
  'Your reader lost its connection during the update. Keep it switched on and near this phone, connect it again, then try again.';
export const READER_UPDATE_BATTERY_MESSAGE =
  'Charge your reader to at least 50% to install the update.';
/** What the payment sheet, POS and Save card say instead of failing while an update installs. */
export const READER_BUSY_UPDATING_MESSAGE =
  'Your card reader is installing an update. Keep it switched on and near this phone, and try again when it has finished.';

export type ReaderUpdatePhase = 'idle' | 'starting' | 'installing' | 'done' | 'failed';

export interface ReaderUpdateState {
  /** The optional update the connected reader reported, or null. */
  available: Reader.SoftwareUpdate | null;
  /** Staff said "Not now". Lasts until the app next connects a reader. */
  dismissed: boolean;
  phase: ReaderUpdatePhase;
  /** 0-1 while installing, once the reader has reported progress. */
  progress: number | null;
  /** Plain-words reason when `phase === 'failed'`. */
  failure: string | null;
}

const INITIAL: ReaderUpdateState = {
  available: null,
  dismissed: false,
  phase: 'idle',
  progress: null,
  failure: null,
};

let state: ReaderUpdateState = INITIAL;
/**
 * True from staff tapping Install until the install ends. The install events are global and a
 * REQUIRED update inside `connectReader` fires them too; those stay with the connect's own
 * `updating` state in the hook and must not be read as the optional install.
 */
let ownInstall = false;
let startTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<ReaderUpdateState>): void {
  state = { ...state, ...next };
  for (const listener of [...listeners]) listener();
}

function clearStartTimer(): void {
  if (startTimer) clearTimeout(startTimer);
  startTimer = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getReaderUpdateState(): ReaderUpdateState {
  return state;
}

/** The shared update state, re-rendering on every change. */
export function useReaderUpdateState(): ReaderUpdateState {
  return useSyncExternalStore(subscribe, getReaderUpdateState, getReaderUpdateState);
}

/** True while an optional update is starting or installing: no payment can use the reader. */
export function isReaderUpdateInstalling(s: ReaderUpdateState = state): boolean {
  return s.phase === 'starting' || s.phase === 'installing';
}

/** Should Reader settings offer the update? Never while one is installing or after "Not now". */
export function shouldOfferReaderUpdate(s: ReaderUpdateState = state): boolean {
  return s.available != null && !s.dismissed && (s.phase === 'idle' || s.phase === 'failed');
}

/** Too little battery to install: the level is known and under the bar. */
export function readerBatteryTooLowForUpdate(batteryLevel: number | null | undefined): boolean {
  return typeof batteryLevel === 'number' && batteryLevel < READER_UPDATE_MIN_BATTERY;
}

/** A real update object (iOS maps a missing one to `{}`, Android to null). */
function isSoftwareUpdate(update: unknown): update is Reader.SoftwareUpdate {
  if (!update || typeof update !== 'object') return false;
  const u = update as { deviceSoftwareVersion?: unknown; estimatedUpdateTime?: unknown };
  return typeof u.deviceSoftwareVersion === 'string' || typeof u.estimatedUpdateTime === 'string';
}

function codeOf(error: unknown): string | null {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : null;
}

function failureFor(error: StripeError | null | undefined): string {
  return codeOf(error) === 'READER_SOFTWARE_UPDATE_FAILED_BATTERY_LOW'
    ? READER_UPDATE_BATTERY_MESSAGE
    : READER_UPDATE_FAILED_MESSAGE;
}

/**
 * A new connection is starting: forget the last reader's offer and a "Not now", so the update is
 * offered again each time the app connects. Left alone while an install runs (it cannot connect
 * then anyway, and the install's own events must still land).
 */
export function noteReaderConnectStarted(): void {
  if (isReaderUpdateInstalling()) return;
  ownInstall = false;
  clearStartTimer();
  state = INITIAL;
  for (const listener of [...listeners]) listener();
}

/** `onDidReportAvailableUpdate`, or the connected reader's `availableUpdate`. */
export function noteAvailableUpdate(update: unknown): void {
  if (!isSoftwareUpdate(update)) return;
  if (isReaderUpdateInstalling()) return;
  set({ available: update, phase: state.phase === 'done' ? 'idle' : state.phase });
}

export function noteInstallStarted(): void {
  if (!ownInstall) return;
  clearStartTimer();
  set({ phase: 'installing', progress: state.phase === 'installing' ? state.progress : 0, failure: null });
}

export function noteInstallProgress(progress: string | number): void {
  if (!ownInstall) return;
  clearStartTimer();
  const value = typeof progress === 'number' ? progress : Number(progress);
  set({
    phase: 'installing',
    failure: null,
    progress: Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : state.progress,
  });
}

export function noteInstallFinished(
  result: { update?: unknown; error?: StripeError | null } | null | undefined,
): void {
  if (!ownInstall) {
    // A required update finished inside a connect: the reader is now up to date, so an older
    // offer no longer applies. A newer one is reported again.
    if (result && !result.error) set({ available: null });
    return;
  }
  ownInstall = false;
  clearStartTimer();
  const error = result?.error ?? null;
  if (!error) {
    set({ phase: 'done', available: null, progress: null, failure: null });
    return;
  }
  if (codeOf(error) === 'CANCELED') {
    // Staff stopped it. Nothing failed; the offer stays.
    set({ phase: 'idle', progress: null, failure: null });
    return;
  }
  set({ phase: 'failed', progress: null, failure: failureFor(error) });
}

/** The Bluetooth reader went away. An install in progress cannot finish now. */
export function noteReaderDisconnected(): void {
  if (!isReaderUpdateInstalling()) return;
  clearStartTimer();
  // `ownInstall` stays set: a finish event that still arrives corrects this.
  set({ phase: 'failed', progress: null, failure: READER_UPDATE_DISCONNECTED_MESSAGE });
}

export function dismissReaderUpdate(): void {
  set({ dismissed: true });
}

/** The SDK calls an install needs (optional on the app's `TerminalHookApi`). */
export interface ReaderUpdateSdk {
  installAvailableUpdate?: () => Promise<{ error?: StripeError } | undefined | null>;
  cancelInstallingUpdate?: () => Promise<{ error?: StripeError } | undefined | null>;
}

/**
 * Staff tapped Install (or Try again) in Reader settings. Returns false when nothing started.
 * The SDK resolves at once; the install itself reports through the events above.
 */
export async function installReaderUpdate(
  sdk: ReaderUpdateSdk,
  batteryLevel: number | null | undefined,
): Promise<boolean> {
  if (isReaderUpdateInstalling() || !state.available) return false;
  if (readerBatteryTooLowForUpdate(batteryLevel)) {
    set({ phase: 'failed', failure: READER_UPDATE_BATTERY_MESSAGE, progress: null });
    return false;
  }
  if (typeof sdk.installAvailableUpdate !== 'function') {
    set({ phase: 'failed', failure: READER_UPDATE_FAILED_MESSAGE, progress: null });
    return false;
  }
  ownInstall = true;
  set({ phase: 'starting', progress: null, failure: null, dismissed: false });
  clearStartTimer();
  startTimer = setTimeout(() => {
    startTimer = null;
    if (state.phase === 'starting') {
      set({ phase: 'failed', failure: READER_UPDATE_NOT_STARTED_MESSAGE, progress: null });
    }
  }, READER_UPDATE_START_TIMEOUT_MS);
  try {
    const res = await sdk.installAvailableUpdate();
    if (res?.error) {
      ownInstall = false;
      clearStartTimer();
      set({ phase: 'failed', progress: null, failure: failureFor(res.error) });
      return false;
    }
    return true;
  } catch {
    ownInstall = false;
    clearStartTimer();
    set({ phase: 'failed', progress: null, failure: READER_UPDATE_FAILED_MESSAGE });
    return false;
  }
}

/**
 * Staff chose to stop an optional install (the SDK only offers a cancel for optional updates).
 * When the SDK refuses, the install carries on and keeps reporting.
 */
export async function cancelReaderUpdate(sdk: ReaderUpdateSdk): Promise<boolean> {
  if (!isReaderUpdateInstalling() || typeof sdk.cancelInstallingUpdate !== 'function') return false;
  try {
    const res = await sdk.cancelInstallingUpdate();
    if (res?.error) return false;
  } catch {
    return false;
  }
  ownInstall = false;
  clearStartTimer();
  set({ phase: 'idle', progress: null, failure: null });
  return true;
}

/**
 * The SDK callbacks that feed this store. `TerminalProvider` registers them from a component that
 * is always mounted, so they land whichever sheets are open.
 */
export const readerUpdateSdkCallbacks = {
  onDidReportAvailableUpdate: (update: unknown) => noteAvailableUpdate(update),
  onDidStartInstallingUpdate: () => noteInstallStarted(),
  onDidReportReaderSoftwareUpdateProgress: (progress: string | number) =>
    noteInstallProgress(progress),
  onDidFinishInstallingUpdate: (
    result: { update?: unknown; error?: StripeError | null } | null | undefined,
  ) => noteInstallFinished(result),
  onDidDisconnect: () => noteReaderDisconnected(),
};

/** Test seam: back to a fresh app run. */
export function __resetReaderSoftwareUpdateForTests(): void {
  ownInstall = false;
  clearStartTimer();
  state = INITIAL;
  for (const listener of [...listeners]) listener();
}
