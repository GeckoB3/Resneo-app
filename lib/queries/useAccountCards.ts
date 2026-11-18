/**
 * The customer's "Saved cards" in one section, grouped by where each card is kept (web
 * Docs/card-on-file-plan.md §5.5, §5.6, §4.6 way 4).
 *
 *   list, grouped       GET    /api/account/payment-methods            (no venue_id: `groups`, `add_targets`)
 *   add or replace      POST   /api/v1/me/payment-methods/card-on-file  { target } -> the card screen
 *   after the card form POST   /api/v1/me/payment-methods/card-on-file/confirm { setup_intent_id }
 *   removal words       GET    /api/v1/me/payment-methods/card-on-file/[cardId]
 *   remove              DELETE /api/v1/me/payment-methods/card-on-file/[cardId]
 *   remove a till card  DELETE /api/account/payment-methods/[venueId]/[paymentMethodId]
 *
 * A server from before card on file answers the list without `groups`; the section then keeps the
 * per-business list it had ({@link useSavedCards}).
 *
 * The card is saved on ResNeo's own Stripe account (the platform), so the card sheet opens with no
 * connected account. Card entry in the app takes typed cards only: Apple Pay and Google Pay would
 * need native set-up and a store build (plan §16.1).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export interface AccountCardMember {
  venue_id: string;
  name: string;
}

export interface AccountCard {
  kind: 'card_on_file' | 'till_card';
  /** The card on file id, or the Stripe payment method id for a till card. */
  id: string;
  /** The business a till card lives at (its removal route needs it). */
  venue_id: string | null;
  label: string;
  expiry: string | null;
  description: string;
  /** What happens to the bookings it protects, shown before removing. */
  removal_text: string;
}

export interface AccountCardGroup {
  /** `business:{venue id}` or `collective:{collective id}`; the same key as its Add card target. */
  key: string;
  kind: 'business' | 'collective';
  name: string;
  members: AccountCardMember[];
  cards: AccountCard[];
}

export interface AccountAddTarget {
  key: string;
  kind: 'business' | 'collective';
  name: string;
  guest_id: string;
}

export type AccountCardsView =
  | { grouped: true; groups: AccountCardGroup[]; addTargets: AccountAddTarget[] }
  /** An older server: no grouped list; the per-business section stays. */
  | { grouped: false };

export const accountCardsKey = (accessToken: string | null) =>
  [...queryKeys.customer.all(), 'accountCards', accessToken] as const;

/** GET every saved card, grouped by where it is kept. */
export function useAccountCards(enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: accountCardsKey(accessToken),
    enabled: enabled && isBackendConfigured() && accessToken !== null,
    queryFn: async (): Promise<AccountCardsView> => {
      const body = await apiFetch<{ groups?: AccountCardGroup[]; add_targets?: AccountAddTarget[] }>(
        '/api/account/payment-methods',
        { accessToken: accessToken! },
      );
      if (!Array.isArray(body.groups)) return { grouped: false };
      return {
        grouped: true,
        groups: body.groups.map((g) => ({ ...g, members: g.members ?? [], cards: g.cards ?? [] })),
        addTargets: Array.isArray(body.add_targets) ? body.add_targets : [],
      };
    },
  });
}

/**
 * The card group that keeps the card for a booking at `venueId`: the business's own group, or a
 * collective group with that business as a member. Only groups with a card on file or a till card.
 */
export function cardGroupForVenue(groups: AccountCardGroup[], venueId: string): AccountCardGroup | null {
  const own = groups.find((g) => g.key === `business:${venueId}` && g.cards.length > 0);
  const collective = groups.find(
    (g) => g.kind === 'collective' && g.cards.length > 0 && g.members.some((m) => m.venue_id === venueId),
  );
  // A collective card wins for new bookings (plan §4.3), so it is the likelier cover.
  return collective ?? own ?? null;
}

/** The card screen from POST card-on-file (plan §5.2). */
export interface AccountCardSetup {
  client_secret: string;
  setup_intent_id: string;
  heading: string;
  button_label: string;
  scope: 'business' | 'collective';
  scope_name: string;
  members: AccountCardMember[];
  consent_text: string;
}

/** POST: open a platform card set-up for a business or collective the customer booked with. */
export function useStartAccountCardSetup() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async (targetKey: string): Promise<AccountCardSetup> => {
      if (!accessToken) throw new Error('Missing access token');
      const body = await apiFetch<Partial<AccountCardSetup>>('/api/v1/me/payment-methods/card-on-file', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ target: targetKey }),
      });
      if (!body.client_secret || !body.setup_intent_id) {
        throw new Error('We could not start saving your card. Please try again.');
      }
      return {
        client_secret: body.client_secret,
        setup_intent_id: body.setup_intent_id,
        heading: body.heading || 'Save a card',
        button_label: body.button_label || 'Save card',
        scope: body.scope === 'collective' ? 'collective' : 'business',
        scope_name: body.scope_name ?? '',
        members: body.members ?? [],
        consent_text: body.consent_text ?? '',
      };
    },
  });
}

/** GET what removing a card on file would do, in words (falls back to `fallback` on failure). */
export async function fetchCardRemovalText(
  accessToken: string,
  cardId: string,
  fallback: string,
): Promise<string> {
  try {
    const body = await apiFetch<{ removal_text?: string }>(
      `/api/v1/me/payment-methods/card-on-file/${encodeURIComponent(cardId)}`,
      { accessToken },
    );
    return body.removal_text || fallback;
  } catch {
    return fallback;
  }
}

/** The removal words, read fresh when the confirmation opens. */
export function useCardRemovalText() {
  const accessToken = useAccessToken();
  return (card: AccountCard): Promise<string> =>
    card.kind === 'card_on_file' && accessToken
      ? fetchCardRemovalText(accessToken, card.id, card.removal_text)
      : Promise.resolve(card.removal_text);
}

export type RemoveAccountCardOutcome =
  | { status: 'removed'; text: string | null }
  /** A till card that pays for a membership: show `message` as sent and ask again. */
  | { status: 'needs_confirmation'; message: string };

/** DELETE a card on file, or a till card at its business. */
export function useRemoveAccountCard() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { card: AccountCard; acknowledge?: boolean }): Promise<RemoveAccountCardOutcome> => {
      if (!accessToken) throw new Error('Missing access token');
      const { card } = args;
      if (card.kind === 'card_on_file') {
        const body = await apiFetch<{ ok?: boolean; removal_text?: string }>(
          `/api/v1/me/payment-methods/card-on-file/${encodeURIComponent(card.id)}`,
          { accessToken, method: 'DELETE' },
        );
        return { status: 'removed', text: body?.removal_text ?? null };
      }
      if (!card.venue_id) throw new Error('We could not remove that card.');
      const path =
        `/api/account/payment-methods/${encodeURIComponent(card.venue_id)}/` +
        `${encodeURIComponent(card.id)}${args.acknowledge ? '?acknowledge=true' : ''}`;
      try {
        await apiFetch(path, { accessToken, method: 'DELETE' });
        return { status: 'removed', text: null };
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const body = error.body as { requires_confirmation?: boolean; message?: string } | undefined;
          if (body?.requires_confirmation && body.message) {
            return { status: 'needs_confirmation', message: body.message };
          }
        }
        throw error;
      }
    },
    onSuccess: (outcome) => {
      if (outcome.status === 'removed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.customer.all() });
      }
    },
  });
}
