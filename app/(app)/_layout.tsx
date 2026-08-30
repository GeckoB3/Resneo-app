import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StaffRequired } from '@/components/auth/StaffRequired';
import { PendingPushRouteHandler } from '@/components/push/PendingPushRouteHandler';
import { LoadingState } from '@/components/ui/LoadingState';
import { WaitlistAvailabilityBanner } from '@/components/waitlist/WaitlistAvailabilityBanner';
import { useColorScheme } from '@/components/useColorScheme';
import { useRole } from '@/lib/queries/useRole';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { darkColors, fonts, lightColors } from '@/theme/index';

/**
 * Authenticated stack — tabs plus staff gate screens.
 * Uses useStaffMe() when the backend is configured.
 */
export default function AppLayout() {
  // The role now comes from useRole(), which is the same computation this file
  // used to do inline. It moved so that push registration and the venue
  // bootstrap read the SAME answer rather than each deriving their own; three
  // copies of "is this person staff" was two too many. The gate's behaviour is
  // unchanged: 'customer' is what this file used to call 'not_staff', and until
  // the customer route group exists it still lands on <StaffRequired/>.
  const role = useRole();
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
    if (role !== 'loading') {
      return;
    }
    const timer = setTimeout(() => setProceedAnyway(true), 5000);
    return () => clearTimeout(timer);
  }, [role]);

  // Render the staff-required screen INLINE (not a redirect into this same gated
  // stack, which infinite-loops). A 401 from staff/me lands here; "Try again"
  // refetches in case the venue API was mid-deploy. This one DOES replace the
  // Stack: it is a terminal state, nothing navigates out of it, and mounting the
  // tabs behind it would fire a burst of doomed 401s for a non-staff user.
  if (role === 'customer') {
    return (
      <StaffRequired
        onRetry={() => void staffQuery.refetch()}
        retrying={staffQuery.isFetching}
      />
    );
  }

  // The transient staff check, by contrast, COVERS the Stack instead of replacing
  // it. Unmounting a navigator makes every router.push() taken during the gap
  // resolve against the parent navigator instead — the degenerate push that fed
  // the 2026-08-16 crash loop (see lib/push/pendingNotificationRoute.ts).
  const checkingStaffAccess = role === 'loading' && !proceedAnyway;

  return (
    <View style={{ flex: 1 }}>
      {/* Cross-dashboard waitlist open-slot alerts (renders null unless in staff_choose mode with a match). */}
      <WaitlistAvailabilityBanner />
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
        name="availability/calendars"
        options={{
          headerShown: true,
          title: 'Calendars',
        }}
      />
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
      {/* Routes a parked notification tap. Lives inside this layout so it can
          only ever push while the (app) navigator is mounted. */}
      <PendingPushRouteHandler />
      {checkingStaffAccess ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
          <LoadingState message="Checking staff access…" />
        </View>
      ) : null}
    </View>
  );
}
