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

import { LoadingState } from '@/components/ui/LoadingState';
import { useColorScheme } from '@/components/useColorScheme';
import { AppProviders } from '@/providers/AppProviders';
import { useAuth } from '@/providers/AuthProvider';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

SplashScreen.preventAutoHideAsync();

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
      console.warn('[fonts] Inter failed to load; falling back to system fonts.', error);
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
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
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
