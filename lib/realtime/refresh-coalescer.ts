/** Same quiet window as the web's `REALTIME_BOOKINGS_DEBOUNCE_MS`. */
export const LIVE_REFRESH_QUIET_MS = 2_500;

/** A steady stream of changes never goes quiet, so the screen still catches up this often. */
export const LIVE_REFRESH_MAX_WAIT_MS = 30_000;

export interface RefreshCoalescer {
  /** One change arrived. */
  note(): void;
  /** Drop anything waiting (the subscriber has gone). */
  cancel(): void;
}

/**
 * Turns a burst of realtime changes into one refresh. Supabase sends one event per row, so an
 * import or an undo writing hundreds of bookings would otherwise send every listening screen's
 * requests again for each row.
 */
export function createRefreshCoalescer(
  run: () => void,
  quietMs: number = LIVE_REFRESH_QUIET_MS,
  maxWaitMs: number = LIVE_REFRESH_MAX_WAIT_MS,
): RefreshCoalescer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstNotedAt: number | null = null;

  function cancel() {
    if (timer) clearTimeout(timer);
    timer = null;
    firstNotedAt = null;
  }

  return {
    note() {
      const now = Date.now();
      firstNotedAt ??= now;
      if (timer) clearTimeout(timer);
      const untilMaxWait = firstNotedAt + maxWaitMs - now;
      timer = setTimeout(
        () => {
          cancel();
          run();
        },
        Math.max(0, Math.min(quietMs, untilMaxWait)),
      );
    },
    cancel,
  };
}
