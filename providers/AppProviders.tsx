import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { queryClient } from '@/lib/queries/queryClient';
import { AuthProvider } from '@/providers/AuthProvider';
import { LinkedVenueProvider } from '@/providers/LinkedVenueProvider';
import { PushNotificationsProvider } from '@/providers/PushNotificationsProvider';
import { ToastProvider } from '@/providers/ToastProvider';
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
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <VenueProvider>
            <LinkedVenueProvider>
              <VenueLiveSyncProvider>
                <PushNotificationsProvider>
                  <ToastProvider>{children}</ToastProvider>
                </PushNotificationsProvider>
              </VenueLiveSyncProvider>
            </LinkedVenueProvider>
          </VenueProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
