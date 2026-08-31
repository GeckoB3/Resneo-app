import { initPaymentSheet, initStripe, presentPaymentSheet } from '@stripe/stripe-react-native';

import { getStripePublishableKey } from '@/lib/env';

import type { PaymentIntentTicket } from '@/lib/payments/customer-purchase';

/**
 * The one file that touches Stripe's native SDK.
 *
 * **Everything else in the purchase flow is ordinary async code and is tested.**
 * This is not: `@stripe/stripe-react-native` is a native module, so it cannot
 * run in jest or on the web, and the only honest verification is a device.
 * Isolating it means a build problem or an API change is one file, and the
 * logic around it, which is where mistakes actually live, stays exercisable.
 *
 * **Native only, and that is why this file ends in `.native.ts`.** The SDK
 * reaches into `react-native/Libraries/Utilities/codegenNativeComponent`, which
 * the web bundler refuses, and this app has static web rendering switched on,
 * so `eas update` exports web as well as iOS and Android. Importing it from a
 * plain `.ts` broke `eas update` outright with "Importing native-only module on
 * web", through the chain passes.tsx to CreditsSection to BuyCreditsSection to
 * useCustomerPurchase to here. The `.ts` sibling is the web stub, matching what
 * `lib/push/notificationsModule.ts` already does for expo-notifications.
 *
 * **Untested at runtime as of C3.** Two native modules were added for this
 * (`@stripe/stripe-react-native` and its `react-native-webview` peer), and this
 * app already ships `@stripe/stripe-terminal-react-native`. Stripe documents
 * nothing about the two SDKs coexisting. On iOS they pull `Stripe ~> 25.11.0`
 * and `StripeTerminal ~> 5.5.0` respectively. That combination needs a real
 * build to confirm, and this comment is here so whoever hits a pod resolution
 * error knows where to look first.
 */

export type CardSheetResult =
  | { status: 'succeeded' }
  /** The customer closed the sheet. Not an error, and not worth a red toast. */
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

/**
 * Show the card sheet for a ticket the server issued, on the venue's own
 * connected account.
 *
 * `merchantDisplayName` is what the customer reads at the top of the sheet, so
 * it is the VENUE's name rather than ResNeo's: they are paying the salon, not
 * the software, and a sheet naming the wrong party is how a legitimate charge
 * gets disputed.
 */
export async function presentCardSheet(args: {
  ticket: PaymentIntentTicket;
  venueName: string;
  /** True for a SetupIntent (saving a card, starting a membership). */
  isSetupIntent: boolean;
}): Promise<CardSheetResult> {
  const { ticket, venueName, isSetupIntent } = args;

  try {
    /*
      Initialise the SDK before every sheet, not once at app start, because the
      account it must talk to changes with the venue.

      Every venue is its own Stripe connected account and the intent exists only
      inside that account, so a sheet opened against the platform account finds
      nothing. Since a customer can hold bookings at several venues, there is no
      single account to configure at the root: the account is a property of the
      purchase, so it is set with the purchase.

      `urlScheme` is what a 3D Secure challenge returns to. It has to match the
      scheme registered in `app.json`, or the customer completes their bank's
      check and lands nowhere.
    */
    const publishableKey = getStripePublishableKey();
    if (!publishableKey) {
      return {
        status: 'failed',
        message: 'Card payments are not set up in this app build.',
      };
    }

    await initStripe({
      publishableKey,
      stripeAccountId: ticket.stripe_account_id,
      urlScheme: 'resneo',
    });

    const init = await initPaymentSheet({
      merchantDisplayName: venueName,
      // The Element is scoped to the venue's connected account. Omitting this
      // would open the sheet against the platform account, where the intent
      // does not exist.
      ...(isSetupIntent
        ? { setupIntentClientSecret: ticket.client_secret }
        : { paymentIntentClientSecret: ticket.client_secret }),
      returnURL: 'resneo://stripe-redirect',
      allowsDelayedPaymentMethods: false,
    });

    if (init.error) {
      return { status: 'failed', message: init.error.message };
    }

    const presented = await presentPaymentSheet();

    if (presented.error) {
      // Stripe reports a dismissal as an error with this code. Treating it as a
      // failure would tell somebody who simply changed their mind that
      // something went wrong.
      if (presented.error.code === 'Canceled') {
        return { status: 'cancelled' };
      }
      return { status: 'failed', message: presented.error.message };
    }

    return { status: 'succeeded' };
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : 'The payment could not be completed.',
    };
  }
}
