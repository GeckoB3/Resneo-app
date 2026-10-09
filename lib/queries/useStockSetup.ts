import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/client';
import { getApiUrl } from '@/lib/env';
import { posFetch, posHeaders } from '@/lib/pos/api';
import type { ImportResult } from '@/lib/retail/product-import';
import { PRODUCT_PAGE, stockSetupPaths, type MovementFilters, type ProductListFilters } from '@/lib/retail/stock-setup-paths';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePosGate } from '@/lib/queries/usePos';
import { downloadAndShareFile } from '@/lib/share/share-binary-file';
import type { StockReport, PurchasingReport } from '@/types/retail-reports';
import type {
  RetailNamedItem,
  RetailProductSearch,
  RetailSupplier,
  StockMovementsResponse,
  StocktakesResponse,
} from '@/types/retail';

/**
 * The products and stock set-up screens' reads and writes (2026-10-09 parity with the web's
 * Products and Stock pages), over the same `/api/venue/retail/*` routes the web calls. Behind the
 * POS gate like every POS query (`usePosGate`), so a venue without POS sends none of them.
 *
 * Writes that change a supplier carry its `version`; a 412 `STALE_RESOURCE` carries the fresh row
 * (`SupplierStaleError`). The server's sentence is shown word for word.
 */

function nextOffset<T extends { total: number; items: unknown[] }>(last: T, pages: T[]): number | undefined {
  const loaded = pages.reduce((n, p) => n + p.items.length, 0);
  return loaded < last.total && last.items.length > 0 ? loaded : undefined;
}

/** Refresh every product and stock read after a change. */
export function invalidateStockSetup(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.pos.all(),
    predicate: (q) =>
      q.queryKey[2] === 'retail-products' ||
      q.queryKey[2] === 'retail-product' ||
      q.queryKey[2] === 'retail-named' ||
      q.queryKey[2] === 'stock-levels' ||
      q.queryKey[2] === 'movements' ||
      q.queryKey[2] === 'product-search' ||
      q.queryKey[2] === 'catalogue' ||
      q.queryKey[2] === 'suppliers' ||
      q.queryKey[2] === 'purchase-orders' ||
      q.queryKey[2] === 'variant-picker' ||
      q.queryKey[2] === 'stock-setup',
  });
}

/** A key of this file's own reads, under the POS keys so a sign-out clears them. */
function setupKey(accessToken: string | null, ...parts: (string | null)[]) {
  return [...queryKeys.pos.all(), 'stock-setup', accessToken ?? null, ...parts] as const;
}

// ─── Products ───────────────────────────────────────────────────────────────

/** The products list with every web filter (category, brand, supplier, use, online, low, archived). */
export function useProductList(filters: ProductListFilters, trackStock: boolean, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const first = stockSetupPaths.productList(filters, 0, trackStock);
  return useInfiniteQuery({
    queryKey: queryKeys.pos.retailProducts(accessToken, first),
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      posFetch<RetailProductSearch>(stockSetupPaths.productList(filters, pageParam, trackStock), { accessToken: accessToken! }),
    getNextPageParam: nextOffset,
    placeholderData: (previous) => previous,
  });
}

export { PRODUCT_PAGE };

/** A bulk change (`op` price, category, archive or unarchive). Answers how many changed. */
export function useBulkProducts() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<{ products: number; options: number }>(stockSetupPaths.productsBulk, { accessToken, method: 'POST', body });
    },
    onSuccess: () => invalidateStockSetup(queryClient),
  });
}

/** Brands, categories or suppliers by name, for the filters and pickers. Archived ones are left out. */
export function useNamedList(kind: 'brands' | 'categories' | 'suppliers', options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.retailNamed(accessToken, kind),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<RetailNamedItem[]> => {
      const res = await posFetch<Record<string, unknown>>(stockSetupPaths.named(kind), { accessToken: accessToken! });
      const rows = Array.isArray(res[kind]) ? (res[kind] as { id: unknown; name: unknown }[]) : [];
      return rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
    },
  });
}

/** Adds a brand, category or supplier by name (`POST {name}` answers `{ item }`). */
export function useAddNamed() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kind: 'brands' | 'categories' | 'suppliers'; name: string }): Promise<RetailNamedItem> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      const res = await posFetch<{ item: { id: unknown; name: unknown } }>(stockSetupPaths.named(input.kind), {
        accessToken,
        method: 'POST',
        body: { name: input.name },
      });
      return { id: String(res.item.id), name: String(res.item.name) };
    },
    onSuccess: (item, input) => {
      queryClient.setQueryData<RetailNamedItem[] | undefined>(queryKeys.pos.retailNamed(accessToken, input.kind), (old) =>
        [...(old ?? []), item].sort((a, b) => a.name.localeCompare(b.name)),
      );
      if (input.kind === 'suppliers') void queryClient.invalidateQueries({ queryKey: queryKeys.pos.suppliers(accessToken) });
    },
  });
}

/** Sends the CSV to the import route: `dry_run` checks every row without writing. */
export function useImportProducts() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { csv: string; dry_run: boolean; columns: Record<string, string> }) => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<ImportResult>(stockSetupPaths.productImport, { accessToken, method: 'POST', body, timeoutMs: 120_000 });
    },
    onSuccess: (_res, body) => {
      if (!body.dry_run) invalidateStockSetup(queryClient);
    },
  });
}

/**
 * "Yes, count my stock" (the first-product prompt, an admin's): reads the settings' version, turns
 * Track stock on, then starts counting the venue's options from zero. Answers null, or the
 * server's sentence when it is refused.
 */
export function useTurnOnTrackStock() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      const current = await posFetch<{ settings: { version: number } }>(stockSetupPaths.posSettings, { accessToken });
      await posFetch(stockSetupPaths.posSettings, {
        accessToken,
        method: 'PATCH',
        body: { version: current.settings.version, track_stock_enabled: true },
      });
      // Count this product's options (and any others) from zero, ready for a first stocktake.
      try {
        await posFetch(stockSetupPaths.trackAll, { accessToken, method: 'POST', body: {} });
      } catch {
        // Track stock is on; the options can be counted from each product.
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pos.bootstrap(accessToken) });
      invalidateStockSetup(queryClient);
    },
  });
}

/** How many products the venue has, archived or not. */
export async function countProducts(accessToken: string): Promise<number> {
  const res = await posFetch<{ total: number }>(stockSetupPaths.productCount, { accessToken });
  return Number(res.total) || 0;
}

// ─── Suppliers ──────────────────────────────────────────────────────────────

/** Every live supplier with all its details (the Suppliers tab). */
export function useSupplierRows(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.suppliers(accessToken),
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<RetailSupplier[]> => {
      const res = await posFetch<{ suppliers?: RetailSupplier[] }>(stockSetupPaths.named('suppliers'), { accessToken: accessToken! });
      return Array.isArray(res.suppliers) ? res.suppliers : [];
    },
  });
}

/** Open orders per supplier (`GET /purchase-orders/by-supplier`), as a map. */
export function useSupplierOpenOrders(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: setupKey(accessToken, 'orders-by-supplier'),
    enabled,
    queryFn: async (): Promise<Record<string, number>> => {
      const res = await posFetch<{ items?: { supplier_id: string; open_orders: number }[] }>(stockSetupPaths.ordersBySupplier, {
        accessToken: accessToken!,
      });
      const out: Record<string, number> = {};
      for (const s of res.items ?? []) out[s.supplier_id] = Number(s.open_orders) || 0;
      return out;
    },
  });
}

/** A supplier change refused because someone else saved first: `item` is their version. */
export class SupplierStaleError extends Error {
  constructor(
    message: string,
    readonly item: RetailSupplier | null,
  ) {
    super(message);
    this.name = 'SupplierStaleError';
  }
}

export type SupplierBody = {
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  account_number: string | null;
  lead_time_days: number | null;
  min_order_pence: number | null;
  notes: string | null;
};

/** Adds a supplier, changes one at its `version`, or archives one (`manage_suppliers`). */
export function useSaveSupplier() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { kind: 'create'; body: SupplierBody }
        | { kind: 'update'; id: string; version: number; body: SupplierBody }
        | { kind: 'archive'; id: string; version: number },
    ): Promise<RetailSupplier> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      try {
        const res =
          input.kind === 'create'
            ? await posFetch<{ item: RetailSupplier }>(stockSetupPaths.named('suppliers'), { accessToken, method: 'POST', body: input.body })
            : await posFetch<{ item: RetailSupplier }>(stockSetupPaths.supplier(input.id), {
                accessToken,
                method: 'PATCH',
                body: input.kind === 'archive' ? { version: input.version, archived: true } : { ...input.body, version: input.version },
              });
        return res.item;
      } catch (error) {
        if (error instanceof ApiError && error.status === 412) {
          const item = (error.body as { item?: RetailSupplier } | undefined)?.item ?? null;
          throw new SupplierStaleError(error.message, item);
        }
        throw error;
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pos.suppliers(accessToken) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.pos.retailNamed(accessToken, 'suppliers') });
      void queryClient.invalidateQueries({ queryKey: setupKey(accessToken, 'orders-by-supplier') });
    },
  });
}

// ─── Stock ──────────────────────────────────────────────────────────────────

/** The suppliers with something low (Low filter's "Suggest an order"), by name. */
export function useLowStockSuppliers(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: setupKey(accessToken, 'low-suppliers'),
    enabled,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const res = await posFetch<{ items?: { supplier_id: string | null; supplier_name: string | null }[] }>(stockSetupPaths.lowStock, {
        accessToken: accessToken!,
      });
      const seen = new Map<string, string>();
      for (const i of res.items ?? []) {
        if (i.supplier_id && i.supplier_name && !seen.has(i.supplier_id)) seen.set(i.supplier_id, i.supplier_name);
      }
      return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ id, name }));
    },
  });
}

/** Movement history with the web's filters (product or option, reason, dates), newest first. */
export function useMovementList(filters: MovementFilters, options: { enabled?: boolean; pageSize?: number } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const size = options.pageSize ?? 50;
  const first = stockSetupPaths.movements(filters, 0, size);
  return useInfiniteQuery({
    queryKey: queryKeys.pos.movements(accessToken, first),
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      posFetch<StockMovementsResponse>(stockSetupPaths.movements(filters, pageParam, size), { accessToken: accessToken! }),
    getNextPageParam: nextOffset,
    placeholderData: (previous) => previous,
  });
}

/** Stocktakes, newest first, fifty at a time. */
export function useStocktakePages(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useInfiniteQuery({
    queryKey: [...queryKeys.pos.stocktakes(accessToken), 'pages'] as const,
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => posFetch<StocktakesResponse>(stockSetupPaths.stocktakes(pageParam), { accessToken: accessToken! }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.stocktakes.length, 0);
      return loaded < last.total && last.stocktakes.length > 0 ? loaded : undefined;
    },
  });
}

/** The stock report (`view_reports`) for a period, and the value on a past date when one is chosen. */
export function useStockReport(from: string, to: string, asOf: string | null, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const path = stockSetupPaths.stockReport(from, to, asOf);
  return useQuery({
    queryKey: setupKey(accessToken, 'stock-report', path),
    enabled,
    placeholderData: (previous) => previous,
    queryFn: () => posFetch<StockReport>(path, { accessToken: accessToken! }),
  });
}

/** Open purchase orders and received value by supplier (`view_reports`) for a period. */
export function usePurchasingReport(from: string, to: string, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const path = stockSetupPaths.purchasingReport(from, to);
  return useQuery({
    queryKey: setupKey(accessToken, 'purchasing-report', path),
    enabled,
    placeholderData: (previous) => previous,
    queryFn: () => posFetch<PurchasingReport>(path, { accessToken: accessToken! }),
  });
}

// ─── Files ──────────────────────────────────────────────────────────────────

/**
 * Downloads a CSV or PDF with the Bearer token and opens the share sheet, as the app shares X and Z
 * reports and packing slips. Answers true when the sheet opened.
 */
export function useShareDownload() {
  const accessToken = useAccessToken();
  return async (path: string, filename: string, mimeType: string, dialogTitle?: string): Promise<boolean> => {
    if (!accessToken) return false;
    const res = await downloadAndShareFile({
      url: `${getApiUrl()}${path}`,
      filename,
      mimeType,
      headers: { ...posHeaders(), Authorization: `Bearer ${accessToken}` },
      dialogTitle,
    });
    return res.ok;
  };
}

