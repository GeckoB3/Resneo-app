import { useCallback, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Persisted calendar preferences (Calendar 02). Stores the user's last calendar
 * view per venue so the Calendar screen restores it on cold start, using
 * `expo-secure-store` (mirroring the get/set/delete + JSON pattern in
 * `providers/LinkedVenueProvider.tsx`). NOT AsyncStorage (per the F5 mandate).
 *
 * The hook is built + tested here; the Calendar screen consumes it later by
 * hydrating its initial state and persisting on change, then running
 * `pruneStaleSelectedId` against the live calendar ids.
 */

/** Time scope of the calendar view (matches the Calendar screen's `Scope`). */
export type CalendarPrefsScope = 'day' | 'week' | 'month';

export interface CalendarPrefs {
  /** Last time scope. */
  scope: CalendarPrefsScope;
  /** Selected calendar id, or the 'all' sentinel, or null for the default. */
  selectedId: string | null;
  /** Visible-window start hour override (0–23), or null to auto-fit. */
  startHourOverride: number | null;
  /** Visible-window end hour override (1–24), or null to auto-fit. */
  endHourOverride: number | null;
}

export const DEFAULT_CALENDAR_PREFS: CalendarPrefs = {
  scope: 'day',
  selectedId: null,
  startHourOverride: null,
  endHourOverride: null,
};

const STORAGE_PREFIX = 'reserveni.calendar.prefs.';

/** Per-venue storage key. SecureStore keys allow [A-Za-z0-9._-]. */
function storageKey(venueId: string): string {
  return `${STORAGE_PREFIX}${venueId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

/** A scope value we recognise; anything else falls back to the default. */
function isScope(v: unknown): v is CalendarPrefsScope {
  return v === 'day' || v === 'week' || v === 'month';
}

/** Coerce an unknown stored blob into a complete, valid CalendarPrefs. */
function coercePrefs(raw: unknown): CalendarPrefs {
  if (raw == null || typeof raw !== 'object') return { ...DEFAULT_CALENDAR_PREFS };
  const o = raw as Record<string, unknown>;
  return {
    scope: isScope(o.scope) ? o.scope : DEFAULT_CALENDAR_PREFS.scope,
    selectedId: typeof o.selectedId === 'string' ? o.selectedId : null,
    startHourOverride: typeof o.startHourOverride === 'number' ? o.startHourOverride : null,
    endHourOverride: typeof o.endHourOverride === 'number' ? o.endHourOverride : null,
  };
}

async function readPrefs(venueId: string): Promise<CalendarPrefs | null> {
  // Web preview is in-memory only (per project rules) — no persistence there.
  if (Platform.OS === 'web') return null;
  try {
    const rawStr = await SecureStore.getItemAsync(storageKey(venueId));
    if (!rawStr) return null;
    return coercePrefs(JSON.parse(rawStr));
  } catch {
    return null;
  }
}

async function writePrefs(venueId: string, value: CalendarPrefs | null): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (value) {
      await SecureStore.setItemAsync(storageKey(venueId), JSON.stringify(value));
    } else {
      await SecureStore.deleteItemAsync(storageKey(venueId));
    }
  } catch {
    // Persistence is best-effort; a failure here must never break the calendar.
  }
}

/**
 * Stale-id guard (mirrors `reconcileOwnerVenue`). If the persisted `selectedId`
 * is a concrete calendar id that no longer exists in the live `validIds` (a
 * calendar was deleted/renamed while the app was closed), drop it back to null
 * so the screen falls back to its default rather than querying a dead calendar.
 * The `'all'` sentinel and a null selection are always preserved.
 *
 * Returns the same object reference when nothing changed, so callers can use it
 * as a cheap "did it change?" check.
 */
export function pruneStaleSelectedId(
  prefs: CalendarPrefs,
  validIds: readonly string[],
  allSentinel = 'all',
): CalendarPrefs {
  const { selectedId } = prefs;
  if (selectedId == null || selectedId === allSentinel) return prefs;
  if (validIds.includes(selectedId)) return prefs;
  return { ...prefs, selectedId: null };
}

export interface UsePersistedCalendarPrefsResult {
  /** The resolved prefs (defaults until hydrated). */
  prefs: CalendarPrefs;
  /** False until the persisted value has been read on cold start. */
  hydrated: boolean;
  /** Merge a partial update into the prefs and persist it. */
  setPrefs: (patch: Partial<CalendarPrefs>) => void;
  /** Clear the persisted prefs for this venue (e.g. reset to defaults). */
  clearPrefs: () => void;
}

/**
 * Read + persist the calendar prefs for a venue. Pass `venueId = null` (e.g. the
 * bootstrap hasn't loaded) to no-op: it stays on defaults and never touches
 * storage until a real id arrives.
 */
export function usePersistedCalendarPrefs(
  venueId: string | null,
): UsePersistedCalendarPrefsResult {
  const [prefs, setPrefsState] = useState<CalendarPrefs>(DEFAULT_CALENDAR_PREFS);
  const [hydrated, setHydrated] = useState(false);
  // Track the venue we hydrated for so writes never target a different key than
  // the one we read from (avoids a race when venueId changes mid-flight). Synced
  // inside the effect below (never during render).
  const venueRef = useRef<string | null>(null);

  // Hydrate (or reset) whenever the venue changes. All state writes happen inside
  // the async continuation (or the explicit reset path), never synchronously in
  // the effect body in a way that cascades — the disable mirrors the same
  // seed-in-effect idiom used by manage/hours.tsx.
  useEffect(() => {
    let cancelled = false;
    venueRef.current = venueId;

    if (!venueId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to defaults when no venue is active
      setPrefsState(DEFAULT_CALENDAR_PREFS);
      setHydrated(false);
      return;
    }

    setHydrated(false);
    void readPrefs(venueId).then((stored) => {
      if (cancelled || venueRef.current !== venueId) return;
      setPrefsState(stored ?? DEFAULT_CALENDAR_PREFS);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const setPrefs = useCallback((patch: Partial<CalendarPrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      const id = venueRef.current;
      if (id) void writePrefs(id, next);
      return next;
    });
  }, []);

  const clearPrefs = useCallback(() => {
    setPrefsState(DEFAULT_CALENDAR_PREFS);
    const id = venueRef.current;
    if (id) void writePrefs(id, null);
  }, []);

  return { prefs, hydrated, setPrefs, clearPrefs };
}
