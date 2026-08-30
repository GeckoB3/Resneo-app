import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { presentCardSheet, type CardSheetResult } from '@/lib/payments/customer-card-sheet';
import { startPurchase, type PurchaseKind } from '@/lib/payments/customer-purchase';

export interface PurchaseArgs {
  kind: PurchaseKind;
  venueId: string;
  venueName: string;
  productId?: string;
}

export type PurchaseOutcome =
  /** Paid. The thing bought may not exist yet: the webhook creates it. */
  | { status: 'succeeded' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

/**
 * Buy something, end to end.
 *
 * Three steps, and the ordering of the third is the one that matters. The
 * server opens the payment, the customer confirms a card, and only then is
 * anything invalidated. Invalidating on a cancelled sheet would refetch
 * unchanged data and, worse, make a customer who backed out watch the screen
 * flicker as though something had happened.
 *
 * **Nothing is created client-side.** The subscription, credit grant or course
 * place comes from the Stripe webhook, because the card is already charged by
 * the time the sheet closes and a client that dropped its connection in between
 * would leave somebody paid-up with nothing bought. So a success here means
 * "paid", not "you now have it", and the screens say so.
 */
export function useCustomerPurchase(
  /** Seam for tests: the card sheet is a native module and cannot run in jest. */
  showCardSheet: (args: {
    ticket: Awaited<ReturnType<typeof startPurchase>>;
    venueName: string;
    isSetupIntent: boolean;
  }) => Promise<CardSheetResult> = presentCardSheet,
) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PurchaseArgs): Promise<PurchaseOutcome> => {
      if (!accessToken) throw new Error('Missing access token');

      const ticket = await startPurchase({
        kind: args.kind,
        accessToken,
        venueId: args.venueId,
        productId: args.productId,
      });

      /*
        A membership and a saved card are SetupIntents: the card is stored and
        charged later, or on a schedule. Credits and courses are paid for now.
        Opening the sheet in the wrong mode fails in a way the customer cannot
        act on, because the secret and the mode have to agree.
      */
      const isSetupIntent = args.kind === 'membership' || args.kind === 'save_card';

      const result = await showCardSheet({
        ticket,
        venueName: args.venueName,
        isSetupIntent,
      });

      if (result.status === 'succeeded') {
        // Only now. See above for why a cancelled sheet must not refetch.
        void queryClient.invalidateQueries({ queryKey: queryKeys.customer.all() });
      }

      return result;
    },
  });
}
