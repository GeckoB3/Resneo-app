import * as Linking from 'expo-linking';

/**
 * Deep link URL Supabase redirects to after the user taps the magic link email.
 * Maps to app/(auth)/callback.tsx via Expo Router.
 *
 * Add this URL in Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.
 */
export function getAuthCallbackRedirectUrl(): string {
  return Linking.createURL('callback');
}
