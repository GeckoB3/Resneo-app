import { Stack } from 'expo-router';

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
 * Still a plain Stack at C2. Tabs arrive with the screens that need them: a hub
 * that already lists what is coming, plus one list behind it, is a stack, and a
 * two-tab bar where one tab is a longer version of the other is furniture.
 */
export default function CustomerLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="bookings" options={{ headerShown: true, title: 'Your bookings' }} />
      <Stack.Screen name="booking/[id]" options={{ headerShown: true, title: 'Booking' }} />
    </Stack>
  );
}
