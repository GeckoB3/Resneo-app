import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { queryClient } from '@/lib/queries/queryClient';
import { AppLockProvider } from '@/providers/AppLockProvider';
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
                  <ToastProvider>
                    {/* Root render-crash net: shows the recoverable ErrorState
                        (and reports via observability) instead of the bare
                        router fallback when a screen isn't wrapped itself. */}
                    <ErrorBoundary label="the app">
                      {/* Opt-in biometric gate (W9.1). Renders {children} plus a
                          full-screen lock overlay above them when armed. Sits
                          inside the boundary so a fault still degrades gracefully,
                          and below Toast so unlock feedback can surface. */}
                      <AppLockProvider>{children}</AppLockProvider>
                    </ErrorBoundary>
                  </ToastProvider>
                </PushNotificationsProvider>
              </VenueLiveSyncProvider>
            </LinkedVenueProvider>
          </VenueProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
