import { Redirect, Stack } from 'expo-router';
import { useMemo } from 'react';

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
  const colorScheme = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  if (staffStatus === 'loading') {
    return <LoadingState message="Checking staff access…" />;
  }

  if (staffStatus === 'not_staff') {
    return <Redirect href="/staff-required" />;
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
    </Stack>
  );
}
