import { Stack } from 'expo-router';

import { PendingPushRouteHandler } from '@/components/push/PendingPushRouteHandler';

import { fonts } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The customer side of the app.
 *
 * A sibling of `(app)`, not a branch inside it, and that is the whole design.
 * The root router mounts exactly one of the two, only once it knows which, and
 * never swaps them for a reason other than signing out or an explicit switch.
 * Mounting one and correcting to the other would unmount a live navigator,
 * which Expo Router implements by dropping every history entry for that screen,
 * and which this app has already died from once (see `app/_layout.tsx`).
 *
 * A Stack wrapping the tabs, rather than tabs alone. A booking's detail is
 * PUSHED over the whole tab bar on purpose: it is a place you go into and come
 * back from, not a fifth destination, and leaving the bar visible under it
 * invites somebody to wander off mid-cancellation.
 */
export default function CustomerLayout() {
  const { colors } = useTheme();

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="booking/[id]" options={{ headerShown: true, title: 'Booking' }} />
      </Stack>
      {/*
        Routes a parked notification tap, exactly as the staff stack does.
        Without it a customer's push would park a booking id that nothing ever
        consumes, so the tap would open the app and go nowhere.

        Safe in both stacks because only one is ever mounted, and
        `takePendingBookingRoute` clears as it reads, so a tap cannot route
        twice. It sits INSIDE the Stack for the same reason it does there: a
        navigator must exist to receive the push.
      */}
      <PendingPushRouteHandler />
    </>
  );
}
