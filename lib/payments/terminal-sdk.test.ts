import {
  androidPermissionMessage,
  ensureTerminalInitialized,
  isDefiniteCardFailure,
  __resetTerminalInitForTests,
} from '@/lib/payments/terminal-sdk';
import { READER_INIT_TIMEOUT_MS } from '@/lib/payments/reader-timeouts';

/**
 * The Stripe SDK's Android permission helper ALWAYS resolves an object with an
 * `error` key, setting it to `null` on success. The caller used to test
 * `'error' in result`, which is key presence and therefore always true, so a
 * fully granted device was reported as refused and Tap to Pay could never work
 * on Android. The granted case below is the test that was missing.
 */
describe('androidPermissionMessage', () => {
  it('returns null when everything was granted', () => {
    expect(androidPermissionMessage({ error: null })).toBeNull();
  });

  it('returns null for an empty error object', () => {
    expect(androidPermissionMessage({ error: {} })).toBeNull();
  });

  it('returns null when the helper is unavailable', () => {
    expect(androidPermissionMessage(undefined)).toBeNull();
    expect(androidPermissionMessage(null)).toBeNull();
    expect(androidPermissionMessage({})).toBeNull();
  });

  it('names location when fine location was refused', () => {
    const msg = androidPermissionMessage({
      error: { 'android.permission.ACCESS_FINE_LOCATION': 'denied' },
    });
    expect(msg).toContain('Location permission');
    expect(msg).toContain('app settings');
  });

  it('names nearby devices when a Bluetooth permission was refused', () => {
    // Android 12+ needs BLUETOOTH_CONNECT/SCAN, granted under "Nearby devices",
    // for Tap to Pay as well as a reader. Reporting these as a location problem
    // sent staff to the wrong setting entirely.
    for (const key of [
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_SCAN',
    ]) {
      const msg = androidPermissionMessage({ error: { [key]: 'never_ask_again' } });
      expect(msg).toContain('Nearby devices');
      expect(msg).toContain('app settings');
    }
  });
});

describe('isDefiniteCardFailure', () => {
  /**
   * The one judgement that decides whether the app may STOP warning staff that a
   * card payment might be in flight. Optimism here hides a payment Stripe
   * actually captured, so anything short of proof answers false.
   */
  const err = (over: Record<string, unknown>) => over as never;

  it('is false without an error at all', () => {
    expect(isDefiniteCardFailure(undefined)).toBe(false);
    expect(isDefiniteCardFailure(null)).toBe(false);
  });

  it('is true when the intent still needs a payment method (a decline)', () => {
    expect(isDefiniteCardFailure(err({ paymentIntent: { status: 'requiresPaymentMethod' } }))).toBe(
      true,
    );
  });

  it('is true when the intent was cancelled', () => {
    expect(isDefiniteCardFailure(err({ paymentIntent: { status: 'canceled' } }))).toBe(true);
  });

  it('is true when the API reports a decline code', () => {
    expect(isDefiniteCardFailure(err({ apiError: { declineCode: 'insufficient_funds' } }))).toBe(
      true,
    );
  });

  it('is FALSE for a bare network failure, where Stripe may have captured', () => {
    // The dangerous case: `confirmPaymentIntent` failed because the connection
    // dropped, not because the card was refused. Staff must keep being warned.
    expect(isDefiniteCardFailure(err({ code: 'REQUEST_TIMED_OUT', message: 'no connection' }))).toBe(
      false,
    );
    expect(isDefiniteCardFailure(err({ apiError: { declineCode: '' } }))).toBe(false);
  });

  it('is FALSE when the money may already be captured', () => {
    for (const status of ['succeeded', 'requiresCapture', 'processing', 'unknown']) {
      expect(isDefiniteCardFailure(err({ paymentIntent: { status } }))).toBe(false);
    }
  });
});

describe('ensureTerminalInitialized', () => {
  beforeEach(() => {
    __resetTerminalInitForTests();
  });

  it('shares ONE initialize() between concurrent callers', async () => {
    /**
     * The device-support probe fires as the card step mounts, and staff can tap a
     * collect button a moment later. Two `initialize()` calls in flight at once
     * makes the second return an error envelope, which aborted an otherwise fine
     * collect with "Could not start the card reader".
     */
    const initialize = jest.fn(
      () => new Promise<{ error?: undefined }>((resolve) => setTimeout(() => resolve({}), 10)),
    );
    const [a, b] = await Promise.all([
      ensureTerminalInitialized({ initialize }),
      ensureTerminalInitialized({ initialize }),
    ]);

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ ok: true, error: null });
    expect(b).toEqual({ ok: true, error: null });
  });

  it('remembers success, so a later caller never re-initialises', async () => {
    const initialize = jest.fn(async () => ({}));
    await ensureTerminalInitialized({ initialize });
    await ensureTerminalInitialized({ initialize });
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache a failure — the next attempt tries again', async () => {
    let attempt = 0;
    const initialize = jest.fn(async () => {
      attempt += 1;
      return attempt === 1 ? { error: { message: 'no connection token' } as never } : {};
    });

    const first = await ensureTerminalInitialized({ initialize });
    expect(first.ok).toBe(false);
    expect(first.error).toBe('no connection token');

    const second = await ensureTerminalInitialized({ initialize });
    expect(second.ok).toBe(true);
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('gives up on an initialize() that never returns, with an actionable message', async () => {
    // Unbounded, this held the shared slot for ever and the sheet showed a
    // spinner with every button disabled.
    jest.useFakeTimers();
    try {
      const pending = ensureTerminalInitialized({ initialize: () => new Promise(() => {}) });
      jest.advanceTimersByTime(READER_INIT_TIMEOUT_MS + 1_000);
      const res = await pending;
      expect(res.ok).toBe(false);
      expect(res.error).toContain('Close the payment sheet');
    } finally {
      jest.useRealTimers();
    }
  });
});
