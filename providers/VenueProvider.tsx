import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

import { useVenue } from '@/lib/queries/useVenue';
import type {
  BookingModel,
  VenueBootstrap,
  VenueFeatureFlagsPayload,
  VenueTerminology,
} from '@/types/venue';

/** Fallback labels when the venue has not customised terminology yet. */
const DEFAULT_TERMINOLOGY: VenueTerminology = {
  client: 'Guest',
  booking: 'Reservation',
  staff: 'Staff',
};

type VenueContextValue = {
  /** Full bootstrap payload when loaded; null while loading or on error. */
  venue: VenueBootstrap | null;
  name: string | null;
  bookingModel: BookingModel | null;
  /** Merged terminology — always has client/booking/staff strings. */
  terminology: VenueTerminology;
  pricingTier: string | null;
  featureFlags: VenueFeatureFlagsPayload | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};

const VenueContext = createContext<VenueContextValue | null>(null);

type VenueProviderProps = {
  children: ReactNode;
};

/**
 * Loads venue bootstrap data once per session and exposes it app-wide.
 * Booking flows and tab labels read terminology from here instead of hard-coding copy.
 */
export function VenueProvider({ children }: VenueProviderProps) {
  const { data, isLoading, isError, error, refetch } = useVenue();

  const value = useMemo<VenueContextValue>(() => {
    const terminology: VenueTerminology = {
      ...DEFAULT_TERMINOLOGY,
      ...(data?.terminology ?? {}),
    };

    return {
      venue: data ?? null,
      name: data?.name ?? null,
      bookingModel: data?.booking_model ?? null,
      terminology,
      pricingTier: data?.pricing_tier ?? null,
      featureFlags: data?.feature_flags ?? null,
      isLoading,
      isError,
      error: error ?? null,
      refetch: () => {
        void refetch();
      },
    };
  }, [data, isLoading, isError, error, refetch]);

  return <VenueContext.Provider value={value}>{children}</VenueContext.Provider>;
}

/** Read venue bootstrap data anywhere under VenueProvider. */
export function useVenueContext(): VenueContextValue {
  const context = useContext(VenueContext);
  if (!context) {
    throw new Error('useVenueContext must be used within VenueProvider.');
  }
  return context;
}
