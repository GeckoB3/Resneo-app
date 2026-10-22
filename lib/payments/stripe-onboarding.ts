import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { STRIPE_RETURN_ROUTE, stripeReturnStatus } from './stripe-return';

/**
 * Stripe onboarding from the app (Plan & payments, and Checkout set-up's "First, connect Stripe"),
 * owner 2026-10-22. Stripe's own pages open in an auth session, and the link asks Stripe to come
 * back to the web's `/stripe-return`, which needs no sign-in and moves straight on to this app's
 * link, so the window closes by itself. Before, Stripe came back to the web dashboard's Settings,
 * behind a sign-in page the app's browser had never seen.
 */

export const STRIPE_ONBOARDING_COPY = {
  expired: 'That link to Stripe expired. Tap the button again to get a new one.',
  failed: 'Could not open Stripe. Try again.',
} as const;

/**
 * This app's link for the Stripe return (Expo Go's own in a device test). `createURL` needs the app's
 * manifest; without one, the installed app's link is still right.
 */
export function stripeReturnUrl(): string {
  try {
    return Linking.createURL(STRIPE_RETURN_ROUTE);
  } catch {
    return `resneo://${STRIPE_RETURN_ROUTE}`;
  }
}

/** The body for `POST /api/venue/stripe-connect`: Stripe comes back through `/stripe-return` to the app. */
export function stripeConnectReturnBody(returnUrl: string = stripeReturnUrl()): {
  return_path: string;
  refresh_path: string;
} {
  const app = encodeURIComponent(returnUrl);
  return {
    return_path: `/stripe-return?status=done&app=${app}`,
    refresh_path: `/stripe-return?status=expired&app=${app}`,
  };
}

/**
 * `returned`: Stripe came back (finished or left part way). `expired`: the link ran out before it
 * was used. `closed`: the owner closed the window, or the phone's own browser opened instead.
 * `failed`: nothing could open. Whatever happened, the caller reads Stripe's status again.
 */
export type StripeOnboardingOutcome = 'returned' | 'expired' | 'closed' | 'failed';

export async function openStripeOnboarding(url: string): Promise<StripeOnboardingOutcome> {
  try {
    // Ephemeral: iOS opens Stripe without asking to "Sign In" first, which would read oddly here.
    // Android: in the app's own task, so the app's link closes the Stripe tab.
    const result = await WebBrowser.openAuthSessionAsync(url, stripeReturnUrl(), {
      preferEphemeralSession: true,
      createTask: false,
    });
    if (result.type !== 'success') return 'closed';
    return stripeReturnStatus(result.url) === 'expired' ? 'expired' : 'returned';
  } catch {
    try {
      await Linking.openURL(url);
      return 'closed';
    } catch {
      return 'failed';
    }
  }
}
