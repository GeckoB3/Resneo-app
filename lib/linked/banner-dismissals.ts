/**
 * Which linked-venue banner rows this device has dismissed, and when (web
 * `LinkedAccountBanner.tsx`, `reserveni.linkedAccountBannerDismissals`). A dismissal holds for
 * 24 hours; the row comes back after that while the feed still carries it.
 *
 * Stored with `expo-secure-store`, the app's storage of record (as `lib/mode/app-mode-store.ts`).
 * A read failure means "nothing dismissed": the worst outcome is a banner shown again.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'resneo_linked_banner_dismissals';

let cached: Record<string, number> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeBannerDismissals(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The dismissals read so far; empty until `loadBannerDismissals` resolves. */
export function getBannerDismissals(): Record<string, number> {
  return cached ?? EMPTY;
}

const EMPTY: Record<string, number> = {};

export async function loadBannerDismissals(): Promise<Record<string, number>> {
  if (cached) return cached;
  if (Platform.OS === 'web') {
    cached = {};
    return cached;
  }
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    cached = parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    cached = {};
  }
  emit();
  return cached;
}

/** Record a dismissal now; old entries past the window are dropped so the map stays small. */
export async function dismissBannerItem(id: string, now = Date.now()): Promise<void> {
  const next: Record<string, number> = {};
  for (const [k, at] of Object.entries(cached ?? {})) {
    if (now - at < 7 * 24 * 60 * 60 * 1000) next[k] = at;
  }
  next[id] = now;
  cached = next;
  emit();
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(next));
  } catch {
    // Kept in memory for this session at least.
  }
}

/** Test seam. */
export function resetBannerDismissalsForTests(): void {
  cached = null;
}
