import { shouldAllowScreenCapture, shouldSimulateCardReaders } from '@/lib/env';

/**
 * The card-reader simulation switch (Tap to Pay design doc §7.6 / §7A.10).
 *
 * This matters more than its size suggests: if it resolves wrong, a build
 * silently talks to a fake reader that always approves. A test that "passes"
 * against a simulator proves nothing about hardware, so the fallback and the
 * override both need pinning.
 */

const KEY = 'EXPO_PUBLIC_TERMINAL_SIMULATED';
// Read via the literal, never `process.env[KEY]`: the expo/no-dynamic-env-var
// lint rule forbids dynamic reads because they are not inlined at build time
// (see the note at the top of lib/env.ts). Writes are fine.
const original = process.env.EXPO_PUBLIC_TERMINAL_SIMULATED;

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

describe('shouldSimulateCardReaders', () => {
  it('falls back to __DEV__ when unset, so existing builds are unchanged', () => {
    delete process.env[KEY];
    expect(shouldSimulateCardReaders()).toBe(__DEV__);
  });

  it("uses real hardware when set to 'false', even in a dev build", () => {
    // The whole point: a dev build (logs, fast refresh) paired with a real
    // WisePad or Tap to Pay phone.
    process.env[KEY] = 'false';
    expect(shouldSimulateCardReaders()).toBe(false);
  });

  it("uses simulated readers when set to 'true', even in a release build", () => {
    process.env[KEY] = 'true';
    expect(shouldSimulateCardReaders()).toBe(true);
  });

  it('ignores anything that is not exactly true or false', () => {
    // A typo must not silently decide how real money is collected.
    process.env[KEY] = 'yes';
    expect(shouldSimulateCardReaders()).toBe(__DEV__);
  });
});

/**
 * The screenshot escape hatch for PII-protected screens (W9.2). Getting this
 * wrong in the permissive direction strips FLAG_SECURE from a release, so the
 * default and the exact-match are both pinned.
 */
const CAPTURE_KEY = 'EXPO_PUBLIC_ALLOW_SCREENSHOTS';
const captureOriginal = process.env.EXPO_PUBLIC_ALLOW_SCREENSHOTS;

afterEach(() => {
  if (captureOriginal === undefined) delete process.env[CAPTURE_KEY];
  else process.env[CAPTURE_KEY] = captureOriginal;
});

describe('shouldAllowScreenCapture', () => {
  it('defaults to protected (capture NOT allowed) when unset, in every build', () => {
    delete process.env[CAPTURE_KEY];
    expect(shouldAllowScreenCapture()).toBe(false);
  });

  it("allows capture only when set to exactly 'true'", () => {
    process.env[CAPTURE_KEY] = 'true';
    expect(shouldAllowScreenCapture()).toBe(true);
  });

  it('treats anything else as protected', () => {
    // '1', 'yes', 'TRUE' must not lift a privacy layer.
    process.env[CAPTURE_KEY] = 'TRUE';
    expect(shouldAllowScreenCapture()).toBe(false);
  });
});
