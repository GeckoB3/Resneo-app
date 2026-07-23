import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Per-device record of which post-onboarding setup prompts the user has tapped
 * through (web parity: `SetupChecklist`'s clicked-steps localStorage store).
 *
 * The web reads localStorage synchronously via `useSyncExternalStore`; React
 * Native has no synchronous storage, so this hydrates once from
 * `expo-secure-store` (the app's storage of record, mirroring
 * `usePersistedCalendarPrefs` — NOT AsyncStorage, per the F5 mandate) and keeps
 * the live set in module state so every mounted checklist updates together.
 *
 * These prompts are soft nudges, so best-effort local persistence is enough:
 * a read/write failure just means the prompt shows again.
 */

function storageKey(venueId: string): string {
  return `resneo_setup_checklist_clicked_${venueId}`;
}

/** Live set per venue, shared across subscribers so a tap updates every card. */
const clickedByVenue = new Map<string, ReadonlySet<string>>();
const listeners = new Set<() => void>();
/** Venues whose stored value has been hydrated (so we read SecureStore once). */
const hydrated = new Set<string>();

const EMPTY: ReadonlySet<string> = new Set();

function notify(): void {
  for (const listener of listeners) listener();
}

function parseStepKeys(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function readClickedSteps(venueId: string): Promise<string[]> {
  // Web preview is in-memory only (per project rules) — no persistence there.
  if (Platform.OS === 'web') return [];
  try {
    return parseStepKeys(await SecureStore.getItemAsync(storageKey(venueId)));
  } catch {
    return [];
  }
}

async function writeClickedSteps(venueId: string, keys: readonly string[]): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(storageKey(venueId), JSON.stringify([...keys]));
  } catch {
    // Best-effort: a persistence failure only means the prompt reappears.
  }
}

/**
 * Record a tap-through prompt as done. Updates the shared set immediately (so
 * the row completes without waiting on storage) and persists in the background.
 */
export function markSetupStepClicked(venueId: string, stepKey: string): void {
  const next = new Set(clickedByVenue.get(venueId) ?? EMPTY);
  if (next.has(stepKey)) return;
  next.add(stepKey);
  clickedByVenue.set(venueId, next);
  notify();
  void writeClickedSteps(venueId, [...next]);
}

/** The set of tap-through prompts completed on this device for `venueId`. */
export function useClickedSetupSteps(venueId: string | null | undefined): ReadonlySet<string> {
  const [, forceRender] = useState(0);

  const subscribe = useCallback(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => subscribe(), [subscribe]);

  // Hydrate once per venue. Guarded by `hydrated` so remounts don't re-read, and
  // so a tap recorded before hydration finishes is never clobbered.
  useEffect(() => {
    if (!venueId || hydrated.has(venueId)) return;
    let cancelled = false;
    void (async () => {
      const stored = await readClickedSteps(venueId);
      if (cancelled) return;
      hydrated.add(venueId);
      if (stored.length === 0) return;
      const merged = new Set(clickedByVenue.get(venueId) ?? EMPTY);
      for (const key of stored) merged.add(key);
      clickedByVenue.set(venueId, merged);
      notify();
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  if (!venueId) return EMPTY;
  return clickedByVenue.get(venueId) ?? EMPTY;
}

/** Test seam: drop all in-memory state so suites start clean. */
export function __resetClickedSetupStepsForTests(): void {
  clickedByVenue.clear();
  hydrated.clear();
  listeners.clear();
}
