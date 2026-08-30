import { initPaymentSheet, presentPaymentSheet } from '@stripe/stripe-react-native';

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
