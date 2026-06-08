import { Stack } from 'expo-router';

/** Unauthenticated stack — sign-in and magic-link callback. */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} initialRouteName="sign-in">
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="callback" />
    </Stack>
  );
}
