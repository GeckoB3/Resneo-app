import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Whether THIS Android device can use Tap to Pay, once Stripe's support probe has said so for
 * certain, remembered across launches.
 *
 * Android has no launch warm-up (that is iOS, `TapToPayProvider`), so until now the app only asked
 * the SDK when the card screen opened, and an answer it could not classify read as "unknown",
 * which counts as supported. A tablet without NFC was therefore offered Tap to Pay, reported to the
 * web as a phone that can take cards, and never offered "Send to a phone". The probe now runs once
 * at launch (`TapToPayProvider`'s Android branch) and its answer is kept here, so the payment
 * sheet, the card screen and the capability report all know before anyone taps.
 *
 * Only definite answers are kept: a probe that could not answer leaves it unknown. The answer is
 * stored with the Android version it was given on, so an Android update asks again. iOS does not
 * use this: its support comes from the device model and the warm-up.
 */

const STORAGE_KEY = 'resneo_tap_to_pay_device_support';

type Stored = { supported: boolean; os: string };

let answer: boolean | null = null;
let loaded = false;
let loading: Promise<boolean | null> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function osVersion(): string {
  return String(Platform.Version);
}

/** The remembered answer, or null while it is unknown (or on iOS). */
export function tapToPayDeviceSupport(): boolean | null {
  return answer;
}

/** True once the stored answer has been read (or found missing). */
export function tapToPayDeviceSupportLoaded(): boolean {
  return loaded;
}

/** Keep a definite answer from the probe, for this launch and the next. Android only. */
export function rememberTapToPayDeviceSupport(supported: boolean): void {
  if (Platform.OS !== 'android') return;
  const changed = answer !== supported || !loaded;
  answer = supported;
  loaded = true;
  if (changed) notify();
  const value: Stored = { supported, os: osVersion() };
  // Best effort: if it can't be kept, the probe simply runs again next launch.
  try {
    void SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(value)).catch(() => undefined);
  } catch {
    // The store is not there (a test, a build without it).
  }
}

/**
 * Reads the stored answer once (later calls share the first). An answer given on another Android
 * version is ignored, so the probe asks again after an update.
 */
export function loadTapToPayDeviceSupport(): Promise<boolean | null> {
  if (loaded) return Promise.resolve(answer);
  if (loading) return loading;
  loading = (async () => {
    let stored: boolean | null = null;
    if (Platform.OS === 'android') {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
        if (parsed && typeof parsed.supported === 'boolean' && parsed.os === osVersion()) stored = parsed.supported;
      } catch {
        stored = null;
      }
    }
    // A probe that answered while the store was being read wins.
    if (!loaded) {
      answer = stored;
      loaded = true;
      notify();
    }
    return answer;
  })();
  return loading;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The remembered answer, re-rendering when the probe or the store gives one. */
export function useTapToPayDeviceSupport(): boolean | null {
  return useSyncExternalStore(subscribe, tapToPayDeviceSupport, tapToPayDeviceSupport);
}

/** Whether the stored answer has been read, re-rendering when it has. */
export function useTapToPayDeviceSupportLoaded(): boolean {
  return useSyncExternalStore(subscribe, tapToPayDeviceSupportLoaded, tapToPayDeviceSupportLoaded);
}

/** Test seam: forget the answer and the store read. */
export function __resetTapToPayDeviceSupportForTests(): void {
  answer = null;
  loaded = false;
  loading = null;
  notify();
}
