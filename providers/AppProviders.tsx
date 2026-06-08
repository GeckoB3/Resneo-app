import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { queryClient } from '@/lib/queries/queryClient';
import { AuthProvider } from '@/providers/AuthProvider';
import { LinkedVenueProvider } from '@/providers/LinkedVenueProvider';
import { PushNotificationsProvider } from '@/providers/PushNotificationsProvider';
import { VenueLiveSyncProvider } from '@/providers/VenueLiveSyncProvider';
import { VenueProvider } from '@/providers/VenueProvider';

type AppProvidersProps = {
  children: ReactNode;
};

/**
 * Root providers for server state and auth session.
 * Wrap the app once in _layout.tsx so every screen can use TanStack Query and useAuth().
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VenueProvider>
          <LinkedVenueProvider>
            <VenueLiveSyncProvider>
              <PushNotificationsProvider>{children}</PushNotificationsProvider>
            </VenueLiveSyncProvider>
          </LinkedVenueProvider>
        </VenueProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
