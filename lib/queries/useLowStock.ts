import { useQuery } from '@tanstack/react-query';

import { posFetch } from '@/lib/pos/api';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { usePosGate } from '@/lib/queries/usePos';

/**
 * The Today screen's Low stock card, over the web home card's route:
 * `GET /api/venue/retail/stock/low?limit=` (under `posRoute`, so a Bearer call works). Counted
 * options of live products at or below their reorder level, lowest first. The route answers
 * `{ enabled: false }` while Track stock is off, so the card hides; as on the web, nothing is asked
 * unless the venue's `pos_enabled` is on.
 */

export interface LowStockItem {
  variant_id: string;
  product_id: string;
  product_name: string;
  option_name: string | null;
  on_hand: number;
  reorder_level: number;
}

export interface LowStockResponse {
  enabled: boolean;
  count: number;
  out_count: number;
  items: LowStockItem[];
}

/** How many rows the card shows (web `SHOWN`). */
export const LOW_STOCK_SHOWN = 5;

export const lowStockPath = (limit: number = LOW_STOCK_SHOWN) => `/api/venue/retail/stock/low?limit=${limit}`;

export const lowStockKey = (accessToken?: string | null) =>
  [...queryKeys.pos.all(), 'low-stock', keyScope(accessToken)] as const;

export function useLowStock(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: lowStockKey(accessToken),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: () => posFetch<LowStockResponse>(lowStockPath(), { accessToken: accessToken! }),
  });
}
