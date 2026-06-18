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

/**
 * Deep link URL for password-reset / invite emails. Points at the auth callback,
 * which verifies the recovery/invite link and then routes to the set-password
 * screen (`app/set-password.tsx`) so the recipient can choose a password.
 *
 * We deliberately reuse `/callback` (not a direct `/set-password` link): the
 * callback owns the OTP/PKCE exchange and the `recovery`/`invite` → set-password
 * branch, so the link must land there to establish the session first.
 */
export function getPasswordResetRedirectUrl(): string {
  return Linking.createURL('callback');
}
