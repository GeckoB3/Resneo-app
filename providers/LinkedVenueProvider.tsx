import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type LinkedVenueContextValue = {
  /**
   * When null, the user is acting as the primary venue account.
   * When set, API calls for bookings/clients should scope to that linked owner venue.
   */
  ownerVenueId: string | null;
  setOwnerVenueId: (venueId: string | null) => void;
};

const LinkedVenueContext = createContext<LinkedVenueContextValue | null>(null);

type LinkedVenueProviderProps = {
  children: ReactNode;
};

/**
 * Stub for linked-account / chair-rental context switching.
 * Phase 2 only stores the selected owner venue id — query hooks will read it later.
 */
export function LinkedVenueProvider({ children }: LinkedVenueProviderProps) {
  const [ownerVenueId, setOwnerVenueIdState] = useState<string | null>(null);

  const setOwnerVenueId = useCallback((venueId: string | null) => {
    setOwnerVenueIdState(venueId);
  }, []);

  const value = useMemo<LinkedVenueContextValue>(
    () => ({
      ownerVenueId,
      setOwnerVenueId,
    }),
    [ownerVenueId, setOwnerVenueId],
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
