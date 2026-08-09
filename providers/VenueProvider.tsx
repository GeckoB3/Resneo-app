import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

import { mergeVenueTerminology } from '@/lib/booking/terminology';
import { useVenue } from '@/lib/queries/useVenue';
import type {
  BookingModel,
  VenueBootstrap,
  VenueFeatureFlagsPayload,
  VenueTerminology,
} from '@/types/venue';

/**
 * Booking model assumed before the venue loads, and if a payload ever arrives
 * without one. Appointments rather than table booking: ResNeo sells appointment
 * scheduling, and the web moved its own stored default the same way
 * (migration 20270103124000) after venues were found greeting appointment
 * clients with "Reservation confirmed".
 */
const FALLBACK_BOOKING_MODEL: BookingModel = 'unified_scheduling';

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
    // Resolved against the venue's own booking model, so an appointments venue
    // never inherits restaurant wording — and a venue that changed model since
    // signup does not keep serving the words of the one it left.
    const terminology: VenueTerminology = mergeVenueTerminology(
      data?.booking_model ?? FALLBACK_BOOKING_MODEL,
      data?.terminology,
    );

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
