import { Platform } from 'react-native';

/**
 * App Store "reader app" posture for the ResNeo (SaaS) subscription.
 *
 * On native app-store builds (iOS + Android) we must NOT sell or change the
 * ResNeo subscription in-app: initial sign-up, resubscribe, and tier
 * upgrades/downgrades are routed to the web dashboard, and the app only VIEWS
 * and MANAGES an existing subscription (Stripe Customer Portal for card details,
 * invoices, and cancellation). This mirrors Netflix/Spotify and avoids Apple App
 * Store Guideline 3.1.1 (and the Google Play Billing equivalent) treating our
 * digital subscription as an in-app purchase that would owe store commission or
 * require StoreKit / Play Billing.
 *
 * IMPORTANT: this is ONLY about the ResNeo subscription. The venue's Stripe
 * Connect flow — taking card payments from clients for real-world appointments
 * and services — is a physical-services payment that both stores explicitly
 * exempt, and is NEVER gated by this policy.
 *
 * On web (Expo web / dev preview) there is no app-store intermediary, so the
 * full in-app billing flow stays enabled.
 */

/**
 * Pure policy check (kept free of React Native runtime state so it can be
 * unit-tested directly): only native mobile storefronts — iOS and Android —
 * follow the reader posture. Everything else (web today, desktop in future) is
 * treated as having no app-store intermediary.
 */
export function subscriptionPurchasesMustUseWeb(os: string): boolean {
  return os === 'ios' || os === 'android';
}

/**
 * True when subscription PURCHASES / PLAN CHANGES must be routed to the web
 * dashboard instead of being performed in-app. Bound to the current platform.
 */
export function mustManageSubscriptionOnWeb(): boolean {
  return subscriptionPurchasesMustUseWeb(Platform.OS);
}
