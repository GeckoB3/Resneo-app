import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';

/**
 * The owner venue id the calendar/bookings surfaces should scope to, or null
 * for the primary venue. Hooks read this to decide whether to query the linked
 * venue (via the dedicated linked-calendar endpoints) or the primary venue.
 */
export function useEffectiveVenueScope(): string | null {
  return useLinkedVenueContext().ownerVenueId;
}
