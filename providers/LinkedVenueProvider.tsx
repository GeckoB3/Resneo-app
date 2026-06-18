import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase';

type LinkedVenueContextValue = {
  /**
   * When null, the user is acting as the primary venue account.
   * When set, the calendar/bookings surfaces scope to that linked owner venue
   * via the dedicated linked-calendar endpoints.
   */
  ownerVenueId: string | null;
  /** Display name of the active linked venue (for the context banner/switcher). */
  ownerVenueName: string | null;
  /** False until the persisted selection has been read on cold start. */
  hydrated: boolean;
  /** Switch the active linked venue (pass null to return to the primary venue). */
  setOwnerVenueId: (venueId: string | null, venueName?: string | null) => void;
  /** Clear any active linked-venue context (e.g. on sign-out). */
  clearOwnerVenue: () => void;
  /**
   * Validate the active selection against the caller's live accessible venues.
   * If a persisted `ownerVenueId` no longer maps to an accepted link (revoked,
   * suspended, or deleted while the app was closed), the context is cleared so
   * the user falls back to their primary venue instead of querying a venue they
   * can no longer see. A no-op when nothing is active or the id is still valid.
   */
  reconcileOwnerVenue: (accessibleVenueIds: string[]) => void;
};

/**
 * Exported so a screen can re-provide an *overridden* owner venue for its
 * subtree only (e.g. the new-booking form targeting a specific linked venue via
 * a route param) without mutating the global persisted selection.
 */
export const LinkedVenueContext = createContext<LinkedVenueContextValue | null>(null);

const STORAGE_KEY = 'reserveni.linked.ownerVenue';

type StoredOwner = { id: string; name: string | null };

async function readStoredOwner(): Promise<StoredOwner | null> {
  // Web preview is in-memory only (per project rules) — no persistence there.
  if (Platform.OS === 'web') return null;
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredOwner;
    return parsed && typeof parsed.id === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

async function writeStoredOwner(value: StoredOwner | null): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (value) {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(value));
    } else {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    }
  } catch {
    // Persistence is best-effort; a failure here must never break the session.
  }
}

type LinkedVenueProviderProps = {
  children: ReactNode;
};

/**
 * Linked-account / chair-rental context switching. Stores the active owner
 * venue (id + name), persisted across launches via SecureStore, and cleared on
 * sign-out so a linked selection never leaks to the next user on a shared
 * device. Phase 1's roster validates the restored id against the caller's live
 * accepted links.
 */
export function LinkedVenueProvider({ children }: LinkedVenueProviderProps) {
  const [ownerVenueId, setOwnerVenueIdState] = useState<string | null>(null);
  const [ownerVenueName, setOwnerVenueName] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore any persisted selection on cold start.
  useEffect(() => {
    let cancelled = false;
    void readStoredOwner().then((stored) => {
      if (cancelled) return;
      if (stored) {
        setOwnerVenueIdState(stored.id);
        setOwnerVenueName(stored.name);
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setOwnerVenueId = useCallback(
    (venueId: string | null, venueName: string | null = null) => {
      setOwnerVenueIdState(venueId);
      setOwnerVenueName(venueId ? venueName : null);
      void writeStoredOwner(venueId ? { id: venueId, name: venueName } : null);
    },
    [],
  );

  const clearOwnerVenue = useCallback(() => {
    setOwnerVenueIdState(null);
    setOwnerVenueName(null);
    void writeStoredOwner(null);
  }, []);

  const reconcileOwnerVenue = useCallback(
    (accessibleVenueIds: string[]) => {
      if (ownerVenueId && !accessibleVenueIds.includes(ownerVenueId)) {
        clearOwnerVenue();
      }
    },
    [ownerVenueId, clearOwnerVenue],
  );

  // Drop the linked context on sign-out so it can't carry to the next user.
  useEffect(() => {
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearOwnerVenue();
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [clearOwnerVenue]);

  const value = useMemo<LinkedVenueContextValue>(
    () => ({
      ownerVenueId,
      ownerVenueName,
      hydrated,
      setOwnerVenueId,
      clearOwnerVenue,
      reconcileOwnerVenue,
    }),
    [ownerVenueId, ownerVenueName, hydrated, setOwnerVenueId, clearOwnerVenue, reconcileOwnerVenue],
  );

  return (
    <LinkedVenueContext.Provider value={value}>{children}</LinkedVenueContext.Provider>
  );
}

/** Read or update which linked venue account is active. */
export function useLinkedVenueContext(): LinkedVenueContextValue {
  const context = useContext(LinkedVenueContext);
  if (!context) {
    throw new Error('useLinkedVenueContext must be used within LinkedVenueProvider.');
  }
  return context;
}
