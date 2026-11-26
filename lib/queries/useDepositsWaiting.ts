import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { DepositWaitingItem, DepositsWaitingResponse } from '@/types/deposits-waiting';

/** The route the Today card reads. */
export const DEPOSITS_WAITING_PATH = '/api/venue/deposits-waiting';

function isItem(v: unknown): v is DepositWaitingItem {
  if (typeof v !== 'object' || v === null) return false;
  const row = v as Record<string, unknown>;
  return typeof row.booking_id === 'string' && row.booking_id.length > 0;
}

/** Fills anything an answer leaves out, so one odd row never breaks the card. */
function normalise(body: Partial<DepositsWaitingResponse> | null | undefined): DepositsWaitingResponse | null {
  if (!body || !Array.isArray(body.items)) return null;
  const items = body.items.filter(isItem).map((i) => ({
    ...i,
    client_name: typeof i.client_name === 'string' ? i.client_name : '',
    text: typeof i.text === 'string' ? i.text : '',
    amount_pence: typeof i.amount_pence === 'number' ? i.amount_pence : 0,
    word: i.word === 'payment' ? ('payment' as const) : ('deposit' as const),
    state: i.state === 'waiting' ? ('waiting' as const) : ('kept' as const),
    cancel_at: typeof i.cancel_at === 'string' ? i.cancel_at : null,
    status_label: typeof i.status_label === 'string' ? i.status_label : '',
    link_label: typeof i.link_label === 'string' ? i.link_label : '',
    can_send: i.can_send === true,
  }));
  return {
    items,
    count: typeof body.count === 'number' ? body.count : items.length,
    currency: typeof body.currency === 'string' && body.currency ? body.currency : 'GBP',
  };
}

/**
 * GET /api/venue/deposits-waiting (Bearer): upcoming staff bookings still owing their deposit,
 * soonest deadline first (web deposit-handling plan DH3).
 *
 * The card stays hidden on any failure: a 404 from a web deploy older than the route, a refusal,
 * or a network error all leave nothing to show (the query answers null or errors, and the card
 * reads both as hidden).
 */
export function useDepositsWaiting(enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: queryKeys.depositsWaiting.list(accessToken),
    enabled: enabled && isBackendConfigured() && accessToken !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: async (): Promise<DepositsWaitingResponse | null> => {
      const body = await apiFetch<Partial<DepositsWaitingResponse>>(DEPOSITS_WAITING_PATH, { accessToken: accessToken! });
      return normalise(body);
    },
  });
}
