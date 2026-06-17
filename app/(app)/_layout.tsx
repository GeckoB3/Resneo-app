import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { StaffRequired } from '@/components/auth/StaffRequired';
import { LoadingState } from '@/components/ui/LoadingState';
import { useColorScheme } from '@/components/useColorScheme';
import { ApiError } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useAuth } from '@/providers/AuthProvider';
import { darkColors, fonts, lightColors } from '@/theme/index';

type StaffGateStatus = 'loading' | 'staff' | 'not_staff' | 'unknown';

/**
 * Maps TanStack Query staff/me state onto the gate used before showing tabs.
 * Keeps the same behaviour as the Phase 1 inline fetch — 401 means not staff.
 */
function useStaffGateStatus(): StaffGateStatus {
  const { session } = useAuth();
  const staffQuery = useStaffMe();

  return useMemo(() => {
    if (!session?.access_token) {
      return 'unknown';
    }

    if (!isBackendConfigured()) {
      // Venue API Bearer auth may not be ready yet — do not block sign-in.
      return 'unknown';
    }

    // Once we have a profile, stay 'staff' through background refetches.
    // Gating on isFetching unmounted the whole Stack mid-session (e.g. the
    // More tab mounting a fresh useStaffMe observer), which reset navigation
    // back to the Calendar tab.
    if (staffQuery.data) {
      return 'staff';
    }

    if (staffQuery.isError) {
      if (staffQuery.error instanceof ApiError && staffQuery.error.status === 401) {
        return 'not_staff';
      }
      return 'unknown';
    }

    return 'loading';
  }, [session?.access_token, staffQuery.data, staffQuery.isError, staffQuery.error]);
}

/**
 * Authenticated stack — tabs plus staff gate screens.
 * Uses useStaffMe() when the backend is configured.
 */
export default function AppLayout() {
  const staffStatus = useStaffGateStatus();
  const staffQuery = useStaffMe();
  const colorScheme = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  // Never block the whole app indefinitely on staff/me. If the check can't
  // complete (e.g. the web preview can't reach the API cross-origin, or a slow
  // network), proceed to the app after a short wait rather than hanging on the
  // "Checking staff access…" screen. A genuine non-staff 401 resolves fast and
  // still routes to <StaffRequired/> below.
  const [proceedAnyway, setProceedAnyway] = useState(false);
  useEffect(() => {
    if (staffStatus !== 'loading') {
      return;
    }
    const timer = setTimeout(() => setProceedAnyway(true), 5000);
    return () => clearTimeout(timer);
  }, [staffStatus]);

  if (staffStatus === 'loading' && !proceedAnyway) {
    return <LoadingState message="Checking staff access…" />;
  }

  // Render the staff-required screen INLINE (not a redirect into this same gated
  // stack, which infinite-loops). A 401 from staff/me lands here; "Try again"
  // refetches in case the venue API was mid-deploy.
  if (staffStatus === 'not_staff') {
    return (
      <StaffRequired
        onRetry={() => void staffQuery.refetch()}
        retrying={staffQuery.isFetching}
      />
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Themed, Inter-set headers — match the tab screens (system default otherwise).
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="booking/[id]"
        options={{
          headerShown: true,
          title: 'Booking',
        }}
      />
      <Stack.Screen
        name="booking/new"
        options={{
          headerShown: true,
          title: 'New booking',
          // Present from the "+" FAB as a modal sheet the staff can swipe to dismiss.
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="client/[id]"
        options={{
          headerShown: true,
          title: 'Client',
        }}
      />
      <Stack.Screen
        name="staff-required"
        options={{
          headerShown: true,
          title: 'Staff access',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="linked-venues/index"
        options={{
          headerShown: true,
          title: 'Linked venues',
        }}
      />
      <Stack.Screen
        name="linked-venues/[id]"
        options={{
          headerShown: true,
          title: 'Linked venue',
        }}
      />
      <Stack.Screen
        name="linked-venues/calendar"
        options={{
          headerShown: true,
          title: 'Linked calendar',
        }}
      />
      <Stack.Screen
        name="collectives/index"
        options={{
          headerShown: true,
          title: 'Venue collectives',
        }}
      />
      <Stack.Screen
        name="collectives/[id]"
        options={{
          headerShown: true,
          title: 'Collective',
        }}
      />
    </Stack>
  );
}
