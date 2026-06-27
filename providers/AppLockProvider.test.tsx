/**
 * AppLockProvider — biometric gate × AppState lifecycle.
 *
 * Regression coverage for the "Resneo is locked" infinite loop. A biometric
 * prompt drives the app `active → inactive → active`; the closing `active` used
 * to be read as a background→foreground resume, which re-raised the lock and
 * immediately re-prompted — forever. These tests drive the prompt's OWN AppState
 * churn (including the trailing `active` landing AFTER the unlock resolves, the
 * exact ordering that bit the reporter) and assert the app does not re-lock, the
 * guard re-arms for genuine resumes, and enabling the toggle doesn't self-lock.
 *
 * The biometric prompt is a manually-resolved deferred so we control EXACTLY
 * when it settles relative to the simulated AppState transitions. jest hoists
 * mock factories above imports; native modules are mocked wholesale (native-only
 * under jest-expo).
 */
import { useEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import { AppLockProvider, useAppLock } from '@/providers/AppLockProvider';

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
// Overlay deps — stubbed so rendering the lock cover can't pull in fonts/symbols.
// The cover's <View> keeps its accessibilityLabel, which is how tests detect it.
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/ui/Text', () => ({ Text: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/haptics', () => ({ hapticError: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/theme/useTheme', () => ({
  useTheme: () => ({ colors: { background: '#000', brand: '#06f', onBrand: '#fff' } }),
}));
jest.mock('@/theme/index', () => ({
  radius: { sm: 6, md: 10, lg: 14 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32 },
}));
// The provider subscribes to auth SIGNED_OUT (reset the lock on a shared device);
// stub the client so that subscription is a harmless no-op in tests.
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  }),
}));

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function makeDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// The AppState 'change' handler the provider registers, captured so tests can
// drive lifecycle transitions deterministically.
let changeHandler: ((s: AppStateStatus) => void) | undefined;
// The biometric prompt currently on screen (manually resolved by the test).
let pendingAuth: Deferred<LocalAuthentication.LocalAuthenticationResult> | undefined;

// The live context value, mirrored out of the tree via an effect (not during
// render) so tests can call setAppLockEnabled.
const captured: { current?: ReturnType<typeof useAppLock> } = {};
function Capture() {
  const api = useAppLock();
  useEffect(() => {
    captured.current = api;
  });
  return null;
}

// Drain microtasks (the async mount effect + each awaited native call) under act.
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

// Deliver an AppState transition and let React commit the resulting update. Safe
// to await because the prompt is a deferred — flushing never auto-resolves it.
const emit = async (s: AppStateStatus) => {
  await act(async () => {
    changeHandler?.(s);
    await Promise.resolve();
  });
};

// Resolve the on-screen biometric prompt and drain the resulting state updates.
const resolveAuth = async (
  result: LocalAuthentication.LocalAuthenticationResult = { success: true },
) => {
  pendingAuth?.resolve(result);
  await flush();
};

const renderProvider = async () => {
  await act(async () => {
    render(
      <AppLockProvider>
        <Capture />
      </AppLockProvider>,
    );
  });
  await flush();
};

const lockVisible = () => screen.queryByLabelText('Resneo is locked') != null;

beforeEach(() => {
  jest.clearAllMocks();
  changeHandler = undefined;
  pendingAuth = undefined;
  captured.current = undefined;

  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    type: string,
    handler: (s: AppStateStatus) => void,
  ) => {
    if (type === 'change') changeHandler = handler;
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener);

  jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
  jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
  // Every prompt is a fresh deferred the test resolves explicitly.
  jest.mocked(LocalAuthentication.authenticateAsync).mockImplementation(() => {
    pendingAuth = makeDeferred();
    return pendingAuth.promise;
  });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('true');
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('AppLockProvider — biometric prompt AppState churn', () => {
  it('does not re-lock when the prompt’s own `active` lands after a successful unlock', async () => {
    await renderProvider();

    // Armed (enabled + supported loaded from the mocks): backgrounding covers.
    await emit('background');
    expect(lockVisible()).toBe(true);

    // Resume: background → inactive → active auto-fires the unlock; the OS then
    // marks the app inactive while Face ID is on screen.
    await emit('inactive');
    await emit('active');
    await emit('inactive');
    expect(lockVisible()).toBe(true); // still covered while Face ID is up

    await resolveAuth({ success: true }); // Face ID succeeds → unlocked
    expect(lockVisible()).toBe(false);

    // The closing prompt's `active` now lands AFTER the unlock resolved — the
    // exact ordering that used to re-lock the app and re-prompt forever.
    await emit('active');

    expect(lockVisible()).toBe(false);
    // One unlock prompt, not a loop.
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('re-arms after a prompt so a genuine later background still locks', async () => {
    await renderProvider();

    // First lock → unlock cycle, including the prompt's trailing `active`.
    await emit('background');
    await emit('inactive');
    await emit('active'); // unlock starts
    await emit('inactive'); // Face ID on screen
    await resolveAuth({ success: true }); // success → unlocked
    await emit('active'); // prompt closes → guard re-arms
    expect(lockVisible()).toBe(false);

    // Re-arm proven: a real background must cover again (the guard didn't latch
    // off and permanently disable locking).
    await emit('background');
    expect(lockVisible()).toBe(true);
  });

  it('does not lock immediately after enabling the toggle', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null); // start disabled
    await renderProvider();

    // Not armed yet: a background does nothing.
    await emit('background');
    expect(lockVisible()).toBe(false);
    await emit('active');

    // Turn the lock ON — the confirm Face ID prompt runs inside setAppLockEnabled,
    // and `appLockEnabled` flips true *during* it.
    let enablePromise: Promise<boolean> | undefined;
    await act(async () => {
      enablePromise = captured.current?.setAppLockEnabled(true);
      await Promise.resolve();
    });
    await emit('inactive'); // confirm prompt on screen
    await resolveAuth({ success: true }); // confirm succeeds → persisted + enabled
    await act(async () => {
      await enablePromise;
    });
    await emit('active'); // confirm prompt closes — used to be read as a resume → lock

    expect(lockVisible()).toBe(false);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'reserveni.security.appLockEnabled',
      'true',
    );
  });

  // The reporter's exact symptom: enabling the toggle on iPhone permanently
  // looped. A real Face ID sheet doesn't churn the app exactly once — its
  // dismissal emits EXTRA inactive↔active transitions. The previous guard
  // cleared on the FIRST trailing `active`, so the SECOND inactive→active was
  // read as a background→foreground resume → re-lock → re-prompt → forever.
  it('does not loop on the EXTRA iOS active churn after enabling (the reported bug)', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null); // start disabled
    await renderProvider();

    let enablePromise: Promise<boolean> | undefined;
    await act(async () => {
      enablePromise = captured.current?.setAppLockEnabled(true);
      await Promise.resolve();
    });
    await emit('inactive'); // confirm prompt on screen
    await resolveAuth({ success: true }); // confirm succeeds → persisted + enabled
    await act(async () => {
      await enablePromise;
    });

    // The Face ID sheet dismissing churns the app MORE than once on real iOS.
    await emit('active');
    await emit('inactive');
    await emit('active');
    await emit('inactive');
    await emit('active');

    expect(lockVisible()).toBe(false);
    // Exactly the one confirm prompt — never a resume re-prompt loop.
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  // Same EXTRA-churn defect, but on the unlock path: after a real resume + a
  // successful Face ID unlock, the sheet's extra inactive↔active transitions
  // must not be mistaken for ANOTHER resume.
  it('does not loop on the EXTRA iOS active churn after unlocking', async () => {
    await renderProvider();

    await emit('background'); // armed (getItem 'true') → cover
    expect(lockVisible()).toBe(true);
    await emit('inactive');
    await emit('active'); // genuine resume → auto unlock prompt (call 1)
    await emit('inactive'); // Face ID on screen
    await resolveAuth({ success: true }); // success → unlocked
    expect(lockVisible()).toBe(false);

    // Extra dismissal churn — the loop trigger on real iOS.
    await emit('active');
    await emit('inactive');
    await emit('active');

    expect(lockVisible()).toBe(false);
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  // The flag-based resume detection must still fire for a GENUINE resume that
  // arrives as background → inactive → active (iOS interposes `inactive`), not
  // just a bare background → active.
  it('still prompts on a real background→inactive→active resume', async () => {
    await renderProvider();

    await emit('background');
    await emit('inactive');
    await emit('active'); // real resume → exactly one unlock prompt
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1);
    expect(lockVisible()).toBe(true); // still covered until Face ID succeeds

    await resolveAuth({ success: true });
    expect(lockVisible()).toBe(false);
  });
});
