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
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AuthNoticeBridge } from '@/components/AuthNoticeBridge';
import { LoadingState } from '@/components/ui/LoadingState';
import { useColorScheme } from '@/components/useColorScheme';
import { initAnalytics } from '@/lib/analytics';
import { captureException, initObservability } from '@/lib/observability';
import { AppProviders } from '@/providers/AppProviders';
import { useAuth } from '@/providers/AuthProvider';

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
  const colorScheme = useColorScheme();
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingState message="Loading session…" />;
  }

  return (
    <>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {/* Surfaces auth notices (e.g. session expiry) via the Toast host, which
          lives under AppProviders above this nav. */}
      <AuthNoticeBridge />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(app)" />
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
    </>
  );
}
