// Install runtime polyfills (global TextEncoder, …) before any other module loads.
import '@/lib/polyfills';

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useNavigationContainerRef } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AuthNoticeBridge } from '@/components/AuthNoticeBridge';
import { LoadingState } from '@/components/ui/LoadingState';
import { initAnalytics } from '@/lib/analytics';
import {
  captureException,
  initObservability,
  registerNavigationContainer,
} from '@/lib/observability';
import { useDeviceOrientationLock } from '@/lib/orientation';
import { useAppMode } from '@/lib/mode/useAppMode';
import { AppProviders } from '@/providers/AppProviders';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/useTheme';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

SplashScreen.preventAutoHideAsync();
// Single reporting choke point + global uncaught-error handler (see lib/observability).
initObservability();
// Product-analytics seam (console/no-op until a backend key is configured).
initAnalytics();

export default function RootLayout() {
  // Phones stay portrait; tablets rotate freely (applied at runtime — see hook).
  useDeviceOrientationLock();

  // Give Sentry the navigation container so every report names the screen it
  // came from. The ref is populated after the first render, so this runs in an
  // effect rather than during it.
  const navigationRef = useNavigationContainerRef();
  useEffect(() => {
    registerNavigationContainer(navigationRef);
  }, [navigationRef]);

  // Inter is the Resneo brand typeface (matches the web app). Loaded at startup
  // so every screen can reference the weights via the typography tokens.
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // A font fetch can fail on a cold/offline start. Degrade to system fonts
  // rather than throwing into the ErrorBoundary (which white-screens the app).
  useEffect(() => {
    if (error) {
      captureException(error, { scope: 'fonts' });
    }
  }, [error]);

  const fontsReady = loaded || !!error;

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  if (!fontsReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProviders>
        <RootLayoutNav />
      </AppProviders>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const { colors, isDark } = useTheme();
  const { session, isLoading } = useAuth();
  const { mode } = useAppMode();

  /*
    Exactly one of (auth), (app), (customer) and `mode-loading` is active at any
    moment, and that invariant is doing real work. Expo Router sends the user to
    "the first available unprotected screen" when no protected one is active,
    and the first unprotected sibling here is `set-password`. Without the
    mode-loading screen, every launch would flash a set-a-password form at
    someone who has one.

    The other half of the invariant is that a side, once mounted, is never
    unmounted by anything except signing out or an explicit switch. Guards that
    settle asynchronously are the hazard: Expo Router removes every history
    entry for a screen whose guard goes true to false, and when that screen is a
    navigator this app has already died from it (see the comment on the loading
    overlay below). So the router waits for a decided mode rather than mounting
    a side and correcting itself.
  */
  const signedIn = !!session;
  const modeResolving = signedIn && mode === 'resolving';

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Surfaces auth notices (e.g. session expiry) via the Toast host, which
          lives under AppProviders above this nav. */}
      <AuthNoticeBridge />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn && mode === 'staff'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && mode === 'customer'}>
          <Stack.Screen name="(customer)" />
        </Stack.Protected>
        {/* Not a spinner in place of the navigator, which is the thing that
            killed the app on 2026-08-16: a real, routable screen, so the router
            always has somewhere legitimate to be while the mode settles. */}
        <Stack.Protected guard={modeResolving}>
          <Stack.Screen name="mode-loading" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* Set-password (invited staff + reset recipients). A top-level sibling,
            not under (auth): the callback exchange creates a session before this
            screen shows, which would unmount the session-gated (auth) group.
            Reachable in either auth state so callback.tsx can route here. */}
        <Stack.Screen name="set-password" />
        {/* Dev-only design-system gallery, reachable via the /design-system URL. */}
        {__DEV__ ? (
          <Stack.Screen
            name="design-system"
            options={{ headerShown: true, title: 'Design system', presentation: 'modal' }}
          />
        ) : null}
      </Stack>
      {/* The session check COVERS the Stack; it must never replace it.
          Rendering a loading screen in place of the navigator leaves expo-router
          with nothing below its internal `__root` route, so any router.push()
          taken during the gap resolves against that root navigator and pushes a
          SECOND `__root` — remounting this entire provider tree. On 2026-08-16 a
          cold-start notification tap did exactly that ~50x/second (each remount
          resetting isLoading, so the session never finished loading) until the
          app died. Keeping the Stack mounted makes a mistimed navigation a
          harmless no-op instead. */}
      {isLoading ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
          <LoadingState message="Loading session…" />
        </View>
      ) : null}
    </>
  );
}
