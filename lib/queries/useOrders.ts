import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/client';
import { posFetch, shopPaths } from '@/lib/pos/api';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { canPos, isPosEnabled, isShopEnabled } from '@/lib/pos/pos-enabled';
import { usePosBootstrap, usePosGate } from '@/lib/queries/usePos';
import type { OrderTab, ShopOrderDetail, ShopOrdersResponse } from '@/types/shop';
import type { VenueBootstrap } from '@/types/venue';

/**
 * Online orders in the app (POS app step 5, plan P7-16; UX spec §8, §13.7), over the web's Pass 6a
 * routes. Behind the POS gate like every POS query; the routes need `manage_orders` and stay open
 * with the shop switch off, so paid orders can still be fulfilled.
 *
 * Status moves are checked by the server against the order's state machine (409
 * `SHOP_ORDER_STATUS_INVALID`, `SHOP_PICKUP_CODE_MISMATCH`) and a replay changes nothing. Cancelling,
 * refunding and recording a return carry a `client_request_id` minted once per sheet by the
 * caller. Server sentences are shown word for word.
 */

/** Orders for a tab and a search, newest first, paged by the server's cursor, with every tab's count. */
export function useShopOrders(params: { tab: OrderTab; q: string }, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const first = shopPaths.orders({ tab: params.tab, q: params.q });
  return useInfiniteQuery({
    queryKey: queryKeys.pos.shopOrders(accessToken, first),
    enabled,
    initialPageParam: null as string | null,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: ({ pageParam }) =>
      posFetch<ShopOrdersResponse>(shopPaths.orders({ tab: params.tab, q: params.q, cursor: pageParam }), { accessToken: accessToken! }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

/** How many paid orders are new (the Orders tile's count). A server before Pass 6a answers nothing. */
export function useOrdersBadge(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.shopOrdersBadge(accessToken),
    enabled,
    staleTime: 30_000,
    refetchInterval: 120_000,
    retry: false,
    queryFn: async (): Promise<number | null> => {
      try {
        const res = await posFetch<{ new_count?: number }>(shopPaths.badge, { accessToken: accessToken! });
        return typeof res.new_count === 'number' ? res.new_count : null;
      } catch (error) {
        if (error instanceof ApiError && [403, 404].includes(error.status)) return null;
        throw error;
      }
    },
  });
}

/** One order: items, customer, fulfilment, payments and refunds, returns, messages and the timeline. */
export function useShopOrder(id: string | null | undefined, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate((options.enabled ?? true) && Boolean(id));
  return useQuery({
    queryKey: queryKeys.pos.shopOrder(accessToken, id ?? null),
    enabled,
    retry: false,
    queryFn: () => posFetch<ShopOrderDetail>(shopPaths.order(id!), { accessToken: accessToken! }),
  });
}

/** Finds an order by its pickup code, typed or scanned. A plain call: the code is never cached. */
export async function lookupOrderByPickupCode(accessToken: string, code: string): Promise<string> {
  const res = await posFetch<{ order_id: string }>(shopPaths.lookup(code), { accessToken });
  return res.order_id;
}

function invalidateOrders(queryClient: QueryClient, accessToken: string | null, id: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.pos.shopOrder(accessToken, id) });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.pos.all(),
    predicate: (q) =>
      q.queryKey[2] === 'shop-orders' ||
      q.queryKey[2] === 'shop-orders-badge' ||
      q.queryKey[2] === 'stock-levels' ||
      q.queryKey[2] === 'end-of-day',
  });
}

export type OrderWrite =
  | {
      kind: 'status';
      body: {
        status: 'preparing' | 'ready' | 'collected' | 'dispatched' | 'delivered';
        pickup_code?: string | null;
        without_code?: boolean;
        carrier?: string | null;
        tracking_number?: string | null;
        tracking_url?: string | null;
        tracking_only?: boolean;
      };
    }
  | { kind: 'cancel'; body: { client_request_id: string; reason: 'stock' | 'customer' | 'notCollected' | 'other' } }
  | {
      kind: 'refund';
      body: {
        client_request_id: string;
        lines: { line_id: string; quantity: number; restock?: boolean }[];
        reason: string;
        note?: string;
        return_request_id?: string;
      };
    }
  | { kind: 'returns'; body: { client_request_id: string; lines: { line_id: string; quantity: number }[]; reason: string; note?: string } }
  | { kind: 'returnUpdate'; returnId: string; body: { action: 'received' | 'evidence' } };

/** Every write to one order; each reads the order and the lists again. */
export function useOrderWrite(id: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrderWrite): Promise<Record<string, unknown>> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      if (input.kind === 'returnUpdate') {
        return posFetch<Record<string, unknown>>(shopPaths.orderReturn(id, input.returnId), {
          accessToken,
          method: 'PATCH',
          body: input.body,
        });
      }
      return posFetch<Record<string, unknown>>(shopPaths.orderAction(id, input.kind), {
        accessToken,
        method: 'POST',
        body: input.body,
        timeoutMs: input.kind === 'cancel' || input.kind === 'refund' ? 30_000 : undefined,
      });
    },
    onSettled: () => invalidateOrders(queryClient, accessToken, id),
  });
}

/**
 * Whether More offers Orders, and its count of new orders (UX spec §2.1, §13.7): Checkout on, the
 * login holds `manage_orders` (from the POS bootstrap), and the shop is on or new paid orders are
 * waiting. Nothing is asked at a venue without Checkout.
 */
export function useOrdersTile(venue: Pick<VenueBootstrap, 'feature_flags'> | null | undefined): {
  enabled: boolean;
  newCount: number | null;
} {
  const posOn = isPosEnabled(venue);
  const boot = usePosBootstrap({ enabled: posOn });
  const canOrders = posOn && canPos(boot.data, 'manage_orders');
  const badge = useOrdersBadge({ enabled: canOrders });
  const newCount = badge.data ?? null;
  return { enabled: canOrders && (isShopEnabled(venue) || (newCount ?? 0) > 0), newCount };
}
