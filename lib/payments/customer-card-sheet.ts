import type { PaymentIntentTicket } from '@/lib/payments/customer-purchase';

/**
 * Web stub. The real card sheet is in the `.native.ts` sibling.
 *
 * `@stripe/stripe-react-native` imports
 * `react-native/Libraries/Utilities/codegenNativeComponent`, which the web
 * bundler refuses outright. This app has static web rendering enabled, so
 * `eas update` exports web alongside iOS and Android, and a plain `.ts` import
 * of the SDK failed the whole update with "Importing native-only module on web"
 * through the chain passes.tsx to CreditsSection to BuyCreditsSection to
 * useCustomerPurchase to the sheet.
 *
 * Same shape as `lib/push/notificationsModule.ts`, which does this for
 * expo-notifications, and for the same reason: a static platform split resolves
 * at bundle time on every platform, where a lazy `await import()` would leave
 * Metro racing over async chunks.
 *
 * Taking payment on web is not a missing feature to be filled in later. The web
 * build exists so the routing and screens can be exercised in a browser; real
 * card entry belongs to the web PORTAL, which has its own Stripe integration.
 */

export type CardSheetResult =
  | { status: 'succeeded' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

export async function presentCardSheet(_args: {
  ticket: PaymentIntentTicket;
  venueName: string;
  isSetupIntent: boolean;
}): Promise<CardSheetResult> {
  /*
    A refusal the caller already knows how to render, rather than a throw. Every
    call site treats `failed` as "tell the customer and change nothing", so the
    web build degrades to a message instead of an unhandled error.
  */
  return {
    status: 'failed',
    message: 'Card payments are only available in the ResNeo app.',
  };
}
