import { shouldSimulateCardReaders } from '@/lib/env';

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
