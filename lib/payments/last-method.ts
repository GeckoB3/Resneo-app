import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { InPersonReaderType } from '@/lib/queries/useTakePayment';

/**
 * Remember which card channel staff used last (Tap to Pay design doc §7A.6:
 * "Persist the last-used method so staff aren't re-asked each time").
 *
 * A salon that always uses a WisePad should not have to think about the choice
 * on every appointment. Stored per device with `expo-secure-store` (the app's
 * storage of record, matching the reader-serial store; NOT AsyncStorage).
 *
 * Purely a convenience: a read failure just means the default is used.
 */

const KEY = 'resneo_in_person_last_method';

/** In-memory mirror so the sheet can render the right default on first paint. */
let cached: InPersonReaderType | null = null;

function isReaderType(value: string | null): value is InPersonReaderType {
  return value === 'tap_to_pay' || value === 'bluetooth';
}

/** The last-used method if one is already known this session. */
export function getCachedLastMethod(): InPersonReaderType | null {
  return cached;
}

/** Load the remembered method (once per app run is plenty). */
export async function loadLastMethod(): Promise<InPersonReaderType | null> {
  if (cached) return cached;
  if (Platform.OS === 'web') return null;
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    cached = isReaderType(stored) ? stored : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Remember the method staff just used successfully. */
export function rememberLastMethod(method: InPersonReaderType): void {
  cached = method;
  if (Platform.OS === 'web') return;
  void SecureStore.setItemAsync(KEY, method).catch(() => {
    // Convenience only; never block a payment on this.
  });
}

/** Test seam. */
export function __resetLastMethodForTests(): void {
  cached = null;
}
