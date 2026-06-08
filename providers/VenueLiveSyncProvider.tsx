import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, type ReactNode } from 'react';

import { queryKeys } from '@/lib/queries/keys';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { useVenueContext } from '@/providers/VenueProvider';

type VenueLiveSyncProviderProps = {
  children: ReactNode;
};

/**
 * One Supabase postgres subscription per venue for the whole app shell.
 * Avoids duplicate channels when Today + Week tabs both mount.
 */
export function VenueLiveSyncProvider({ children }: VenueLiveSyncProviderProps) {
  const queryClient = useQueryClient();
  const { venue } = useVenueContext();
  const venueId = venue?.id ?? null;

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
  }, [queryClient]);

  const subscriptions = useMemo(
    () => (venueId ? [{ table: 'bookings', filter: `venue_id=eq.${venueId}` }] : []),
    [venueId],
  );

  useVenueLiveSync({
    venueId,
    enabled: Boolean(venueId),
    onRefresh: handleRefresh,
    subscriptions,
  });

  return <>{children}</>;
}
