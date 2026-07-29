/**
 * Time budgets for the card-reader paths, and the two helpers that apply them.
 *
 * WHY THIS EXISTS (found on device: "Getting the card reader ready" spins for
 * ever and Back does nothing):
 *
 * every await between "staff pressed Use card reader" and "the client can tap"
 * goes to either the Terminal SDK's native bridge or the network, and some of
 * them are documented NOT to settle on their own. The worst is
 * `discoverReaders({ discoveryMethod: 'bluetoothScan' })`: in the pinned
 * `0.0.1-beta.31` the JS promise is resolved from the *discovery completion*
 * handler on both platforms — iOS resolves inside
 * `Terminal.shared.discoverReaders(config, delegate:) { … }` and Android from
 * `RNDiscoveryListener`, and the configuration's `timeout` defaults to `0`,
 * meaning "scan until cancelled". A Bluetooth scan therefore ends only when it
 * is cancelled or when a successful `connectReader` ends it.
 *
 * Awaiting that promise as if it meant "discovery finished" is what deadlocked
 * the silent-reconnect path: it waited for a discovery that only the connect it
 * was gating could end. Readers arrive on the `onUpdateDiscoveredReaders`
 * callback instead, so the scan waits for THOSE — bounded by the budget below.
 *
 * A timeout is not a nicety here: it is the difference between a spinner with
 * every button disabled and an error message with a Retry next to it.
 */

/** `initialize()` — a native bridge call; slow on first run, never minutes. */
export const READER_INIT_TIMEOUT_MS = 20_000;

/**
 * The connection-token POST that also yields the Terminal Location.
 * `apiFetch` already time-boxes each attempt at 15s, but it retries once after a
 * 401 (resume-from-background token refresh), and the refresher itself awaits
 * Supabase with no bound — so the worst legitimate case is roughly two attempts.
 */
export const READER_TOKEN_TIMEOUT_MS = 30_000;

/** How long to wait for ANY reader to appear before saying none did. */
export const READER_DISCOVERY_TIMEOUT_MS = 20_000;

/**
 * `connectReader` for a Bluetooth reader — but as a budget of SILENCE, not a hard
 * ceiling on the call.
 *
 * A mandatory firmware install runs inside `connectReader` and legitimately takes
 * minutes, so `awaitReaderConnect` (bluetoothReader.ts) re-arms this budget for as
 * long as the reader keeps reporting install progress. It expires only when the
 * handshake has been silent for this long, which is the case where the reader has
 * genuinely died and `status: 'connecting'` would otherwise disable every collect
 * button for the rest of the shift. Staff's escape from a merely slow connect is
 * Cancel, not this timer.
 */
export const READER_CONNECT_TIMEOUT_MS = 180_000;

/** `connectReader` for Tap to Pay: the phone's own reader, no firmware step. */
export const TAP_TO_PAY_CONNECT_TIMEOUT_MS = 60_000;

/** Stopping a discovery is a local operation; it should be near-instant. */
export const READER_CANCEL_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Staff-facing messages. Each names something the staff member can actually do:
// they land on a live counter with a client waiting, so "timed out" is useless.
// ---------------------------------------------------------------------------

export const READER_INIT_TIMEOUT_MESSAGE =
  'The card reader could not be started. Close the payment sheet and open it again.';

export const READER_TOKEN_TIMEOUT_MESSAGE =
  'Could not reach Resneo to set up the payment. Check your connection and try again.';

export const READER_DISCOVERY_TIMEOUT_MESSAGE =
  'No card readers found. Check the reader is switched on and nearby, then try again.';

/**
 * Only ever shown for a handshake that has gone SILENT — never while an install is
 * reporting progress, because power-cycling a reader mid-flash bricks it (see
 * `awaitReaderConnect`).
 */
export const READER_CONNECT_TIMEOUT_MESSAGE =
  'The reader did not finish connecting. Switch it off and on again, then try again.';

/** A reader hook's await ran out of time. Its message is already staff-facing. */
export class ReaderTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReaderTimeoutError';
  }
}

/**
 * Reject with `message` if `work` has not settled within `ms`.
 *
 * The timer is always cleared when the race settles: a pending timer keeps a
 * Jest worker alive and, on device, wakes the JS thread for nothing.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ReaderTimeoutError(message)), ms);
  });
  // If the timeout wins, `work` may still reject later. Attaching this handler
  // marks that rejection handled (it does not affect the race) so a stalled SDK
  // call cannot surface as an unhandled promise rejection.
  void work.catch(() => {});
  return Promise.race([work, expiry]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * A promise that resolves `'timeout'` after `ms`, plus the `cancel()` that stops
 * its timer. For races where running out of time is a NORMAL outcome to branch
 * on rather than an error to throw (e.g. "no reader appeared in time").
 */
export function timeoutSignal(ms: number): {
  signal: Promise<'timeout'>;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const signal = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  return {
    signal,
    cancel: () => {
      if (timer) clearTimeout(timer);
    },
  };
}
