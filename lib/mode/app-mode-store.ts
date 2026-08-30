import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Which face of the app a person who could see either has chosen.
 *
 * Someone can be a venue's staff AND another venue's customer; linked accounts
 * actively create these people. `useRole()` answers what they ARE, which for
 * such a person is always `staff`, because the staff check succeeds. It cannot
 * answer which app they want to be looking at right now, and that is what this
 * remembers.
 *
 * Stored with `expo-secure-store`, the app's storage of record, matching
 * `lib/payments/last-method.ts` rather than reaching for AsyncStorage.
 *
 * A read failure means "no preference", never an error: the worst outcome is
 * that a dual-role person lands on the side they did not pick last time and
 * uses the switcher, which costs one tap.
 */

const KEY = 'resneo_app_mode';

export type AppModeChoice = 'staff' | 'customer';

/**
 * In-memory mirror, so the router can decide on first paint rather than
 * flashing one mode and then swapping to the other. A mode swap is a navigator
 * swap, which is the single thing the routing in this app must not do casually.
 */
let cached: AppModeChoice | null = null;
let loaded = false;

/**
 * Subscribers, so a switch made on one screen reaches the router.
 *
 * Without this the store is write-only from the app's point of view: the
 * settings screen would update the module cache, and the router, holding its
 * copy in component state, would never learn that anything had changed. The
 * user would tap "switch" and watch nothing happen.
 */
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to changes. Shaped for `useSyncExternalStore`. */
export function subscribeAppMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isChoice(value: string | null): value is AppModeChoice {
  return value === 'staff' || value === 'customer';
}

/** The remembered choice, if this process has already read it. */
export function getCachedAppMode(): AppModeChoice | null {
  return cached;
}

/** Whether the store has been consulted yet this run. */
export function isAppModeLoaded(): boolean {
  return loaded;
}

/** Read the remembered choice. Safe to call repeatedly; only the first hits disk. */
export async function loadAppMode(): Promise<AppModeChoice | null> {
  if (loaded) return cached;
  if (Platform.OS === 'web') {
    loaded = true;
    return null;
  }
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    cached = isChoice(stored) ? stored : null;
  } catch {
    cached = null;
  }
  loaded = true;
  return cached;
}

/** Remember an explicit switch. */
export function rememberAppMode(mode: AppModeChoice): void {
  cached = mode;
  loaded = true;
  emit();
  if (Platform.OS === 'web') return;
  void SecureStore.setItemAsync(KEY, mode).catch(() => {
    // A convenience only. Failing to persist costs one tap next launch.
  });
}

/**
 * Forget the choice.
 *
 * Called on sign-out: the next person to use this device is very often not the
 * same person, and inheriting a stranger's mode is confusing at best. On a
 * shared salon tablet it would put a staff member into customer mode with no
 * explanation.
 */
export function clearAppMode(): void {
  cached = null;
  loaded = true;
  emit();
  if (Platform.OS === 'web') return;
  void SecureStore.deleteItemAsync(KEY).catch(() => {});
}

/** Test seam: forget that the store was ever read. */
export function resetAppModeForTests(): void {
  cached = null;
  loaded = false;
  emit();
}

/**
 * Switch sides.
 *
 * A separate export from the router's `useAppMode` on purpose: a screen that
 * offers the switch needs to WRITE the choice, and nothing else. Importing the
 * full hook to get at `choose` drags in the role check and the profile read,
 * which is how the staff settings screen ended up needing a QueryClient it had
 * never wanted.
 */
export function switchAppMode(mode: AppModeChoice): void {
  rememberAppMode(mode);
}
