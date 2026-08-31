import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * The customer's own account: money paid, cards saved, and the ways ResNeo is
 * allowed to contact them.
 *
 * Mixed paths on purpose (D3). `payments` and `profile` carry a `/api/v1/me`
 * alias; `payment-methods`, `password`, `marketing-preferences` and
 * `sign-out-everywhere` do not, and are called on `/api/account/*` rather than
 * backfilled with aliases that could not hold a shape stable anyway.
 */

export interface CustomerPayment {
  id: string;
  booking_id: string | null;
  venue_id: string;
  method: string | null;
  status: string;
  amount_pence: number;
  currency: string | null;
  purpose: string | null;
  created_at: string;
}

/**
 * Settled payments.
 *
 * The response deliberately carries no Stripe identifiers, no staff id and no
 * internal note; the web strips them at the source, so there is nothing to
 * filter here and nothing to leak by forgetting to.
 */
export function useCustomerPayments(bookingId?: string) {
  const accessToken = useAccessToken();
  const path = bookingId
    ? `/api/v1/me/payments?booking_id=${encodeURIComponent(bookingId)}`
    : '/api/v1/me/payments';

  return useQuery({
    queryKey: queryKeys.customer.payments(bookingId ?? null, accessToken),
    enabled: isBackendConfigured() && accessToken !== null,
    queryFn: async (): Promise<{ payments: CustomerPayment[] }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ payments: CustomerPayment[] }>(path, { accessToken });
    },
  });
}

export interface SavedCard {
  id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
}

/**
 * Cards saved at ONE venue.
 *
 * Per venue rather than per customer, because that is how they are stored: each
 * venue is its own Stripe connected account, so "my saved cards" is a question
 * with a different answer at every venue a customer has been to. The route
 * refuses without a `venue_id` for the same reason.
 */
export function useSavedCards(venueId: string | null | undefined) {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: queryKeys.customer.cards(venueId ?? null, accessToken),
    enabled: isBackendConfigured() && accessToken !== null && Boolean(venueId),
    queryFn: async (): Promise<{ payment_methods: SavedCard[] }> => {
      if (!accessToken || !venueId) throw new Error('Missing venue');
      return apiFetch<{ payment_methods: SavedCard[] }>(
        `/api/account/payment-methods?venue_id=${encodeURIComponent(venueId)}`,
        { accessToken },
      );
    },
  });
}

/** What the server says when removing a card would affect something. */
export interface RemoveCardConfirmation {
  requires_confirmation: true;
  message: string;
}

export type RemoveCardOutcome =
  | { status: 'removed' }
  /** Show `message` VERBATIM: it names what the card is paying for. */
  | { status: 'needs_confirmation'; message: string };

/**
 * Remove a saved card, honouring the 409 that says what it pays for.
 *
 * The web answers `409 { requires_confirmation, message }` when the card backs
 * a membership, and the same call with `?acknowledge=true` goes through. The
 * message is shown as sent rather than reworded, because it names the specific
 * membership, and a client that summarised it would be guessing at which one.
 */
export function useRemoveCard(venueId: string | null | undefined) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      paymentMethodId: string;
      acknowledge?: boolean;
    }): Promise<RemoveCardOutcome> => {
      if (!accessToken || !venueId) throw new Error('Missing venue');
      const path =
        `/api/account/payment-methods/${encodeURIComponent(venueId)}/` +
        `${encodeURIComponent(args.paymentMethodId)}${args.acknowledge ? '?acknowledge=true' : ''}`;

      try {
        await apiFetch(path, { accessToken, method: 'DELETE' });
        return { status: 'removed' };
      } catch (error) {
        /*
          A 409 here is an ANSWER, not a failure: the server is telling us the
          card pays for something and asking whether the customer meant it.
          Letting it throw would surface "something went wrong" for a question.
        */
        if (error instanceof ApiError && error.status === 409) {
          const body = error.body as RemoveCardConfirmation | undefined;
          if (body?.requires_confirmation && body.message) {
            return { status: 'needs_confirmation', message: body.message };
          }
        }
        throw error;
      }
    },
    onSuccess: (outcome) => {
      // Only a real removal changes anything. A 409 asking for confirmation has
      // left the card exactly where it was.
      if (outcome.status === 'removed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.customer.all() });
      }
    },
  });
}

/** Set a new password. The customer may not have had one before. */
export function useSetPassword() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async (password: string) => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch('/api/account/password', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ password }),
      });
    },
  });
}

/**
 * Sign out everywhere.
 *
 * Revokes every session, this device included, so the caller must expect to be
 * signed out rather than treat it as a background action.
 */
export function useSignOutEverywhere() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async () => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch('/api/account/sign-out-everywhere', { accessToken, method: 'POST' });
    },
  });
}

/**
 * Marketing consent, per venue.
 *
 * Read from `/api/v1/me/venues`, which carries `marketing_consent` per
 * relationship, because the PATCH route has no GET of its own. Written back one
 * venue at a time, since consent is given to a venue rather than to ResNeo.
 */
export function useSetMarketingConsent() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { guestId: string; consent: boolean }) => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch('/api/account/marketing-preferences', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ guest_id: args.guestId, marketing_consent: args.consent }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customer.all() });
    },
  });
}
