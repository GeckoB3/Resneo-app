import * as SecureStore from 'expo-secure-store';
import { useCallback, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * The one date the Calendar tab and the Appointments tab share.
 *
 * Picking a day on either screen picks it on both, and it stays picked when the
 * person leaves the screen, leaves the app, or the phone closes the app in the
 * background. It goes back to today only when they press "Today" or sign in
 * again: AuthProvider reports every change of login here, and no login (signing
 * out, or a session that ended) forgets the date, so the next sign-in starts on
 * today.
 *
 * Nothing stored means "today", so a person who never moves off today is never
 * left on yesterday after midnight. Picking today stores nothing.
 *
 * Kept in memory for the screens and in SecureStore across launches, with the
 * login that picked it, as the chosen site is (`lib/sites/active-site.ts`).
 * The web keeps the same rule in `src/lib/calendar/diary-date.ts`.
 */

const STORAGE_KEY = 'resneo_diary_date_v1';

type StoredDate = { userId: string | null; date: string };

let stored: StoredDate | null = null;
/** The SecureStore read on launch; null until started. */
let hydration: Promise<void> | null = null;
let hydrated = false;
/** The signed-in user, from AuthProvider; undefined until it has said. */
let currentUserId: string | null | undefined;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/** A real calendar date as YYYY-MM-DD, or null. */
export function parseDiaryDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d!));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m! - 1 && t.getUTCDate() === d ? value : null;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetweenDateStrs(from: string, to: string): number {
  const utc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

async function readStored(): Promise<StoredDate | null> {
  if (Platform.OS === 'web') return null;
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDate> | null;
    const date = parseDiaryDate(parsed?.date);
    return date ? { date, userId: typeof parsed?.userId === 'string' ? parsed.userId : null } : null;
  } catch {
    return null;
  }
}

async function writeStored(value: StoredDate | null): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (value) await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(value));
    else await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // Kept in memory for this run at least; the next launch starts on today.
  }
}

/** Forget a date that belongs to someone else, or to nobody (signed out). */
function reconcileUser(): void {
  if (!hydrated || currentUserId === undefined || !stored) return;
  if (currentUserId === null || stored.userId !== currentUserId) {
    stored = null;
    void writeStored(null);
    emit();
  }
}

/**
 * Read the stored date. Started once, at launch (`app/_layout.tsx`), so the
 * screens open on it rather than on today. Safe to call again.
 */
export function startSharedDiaryDateHydration(): Promise<void> {
  if (!hydration) {
    hydration = readStored().then((value) => {
      // A day picked in this run before the read finished wins over the stored one.
      if (!hydrated && !stored && value) stored = value;
      hydrated = true;
      reconcileUser();
      emit();
    });
  }
  return hydration;
}

/**
 * AuthProvider says who is signed in. Nobody (signing out, or a session that
 * ended) or a different login drops the date: the next sign-in starts on today.
 */
export function syncSharedDiaryDateUser(userId: string | null): void {
  currentUserId = userId;
  if (hydration && !hydrated) {
    void hydration.then(reconcileUser);
    return;
  }
  hydrated = true;
  reconcileUser();
}

/** The picked date, or null for "today". */
export function getSharedDiaryDate(): string | null {
  return stored?.date ?? null;
}

/**
 * Pick `date` on both screens. `today` (the venue's today) is stored as
 * nothing, so the screens follow the calendar day from then on.
 */
export function setSharedDiaryDate(date: string, today: string): void {
  const valid = parseDiaryDate(date);
  if (!valid) return;
  const next = valid === today ? null : valid;
  if ((stored?.date ?? null) === next) return;
  stored = next ? { date: next, userId: currentUserId ?? null } : null;
  void writeStored(stored);
  emit();
}

export function subscribeSharedDiaryDate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type SharedDiaryDateUpdate = string | ((current: string) => string);

/**
 * The shared date for a screen, as `[date, setDate]`. `today` is the venue's
 * today; the date is today whenever nothing is picked. The setter takes a value
 * or an updater, resolved against the latest date so quick taps on the arrows
 * step from where the last one landed.
 */
export function useSharedDiaryDate(today: string): [string, (next: SharedDiaryDateUpdate) => void] {
  const picked = useSyncExternalStore(subscribeSharedDiaryDate, getSharedDiaryDate, getSharedDiaryDate);
  const setDate = useCallback(
    (next: SharedDiaryDateUpdate) => {
      const date = typeof next === 'function' ? next(getSharedDiaryDate() ?? today) : next;
      setSharedDiaryDate(date, today);
    },
    [today],
  );
  return [picked ?? today, setDate];
}

/** Test seam: back to a fresh launch. */
export function __resetSharedDiaryDateForTests(): void {
  stored = null;
  hydration = null;
  hydrated = false;
  currentUserId = undefined;
  listeners.clear();
}
