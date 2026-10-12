import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * The customer's loyalty stamp cards, from `GET /api/v1/me/loyalty` (the alias of the web's
 * `/api/account/loyalty`, built by `loadAccountLoyalty`; UX spec §21.4).
 *
 * The web answers one card per venue where the customer has at least one stamp or a reward
 * waiting, at venues with loyalty switched on, so an empty list is the usual answer and means
 * "nothing to show", not a fault.
 *
 * As with `useCustomerHome`, only the fields the Home card renders are declared. The web also
 * sends `name`, `progress_text`, `how_text` and each reward's `reward_line`; the app writes those
 * sentences from its own copy (components/customer/loyalty-copy.ts) under the same ids instead.
 */

/** A reward waiting to be used. */
export interface CustomerLoyaltyReward {
  id: string;
  /** The reward in words, "a free Cut" or "£5.00 off", in the venue's currency: the server's words. */
  text: string;
  /**
   * "Use it by 3 October 2026.", or null when the reward never runs out. It arrives filled because
   * the date is the reward's last day in the VENUE's time zone, and the payload carries neither
   * the expiry itself nor that zone.
   */
  expires_text: string | null;
}

/** One stamp card (web `AccountLoyaltyCard`). */
export interface CustomerLoyaltyCard {
  venue_id: string;
  venue_name: string;
  /** Stamps on the card now, never below zero. */
  stamps: number;
  /** Stamps that fill this round of the card. */
  needed: number;
  /** Rewards waiting and not run out, oldest first. */
  rewards: CustomerLoyaltyReward[];
}

export interface CustomerLoyalty {
  venues: CustomerLoyaltyCard[];
}

export function useCustomerLoyalty() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.customer.loyalty(accessToken),
    enabled,
    queryFn: async (): Promise<CustomerLoyalty> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const body = await apiFetch<Partial<CustomerLoyalty> | null>('/api/v1/me/loyalty', {
        accessToken,
      });
      // The web reads a body without a list as no cards, and so does this.
      return { venues: Array.isArray(body?.venues) ? body.venues : [] };
    },
  });
}
