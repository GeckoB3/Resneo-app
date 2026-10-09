import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiErrorCode } from '@/lib/api/client';
import { formDataFile } from '@/lib/api/form-data-file';
import { getApiUrl } from '@/lib/env';
import { posFetch, posHeaders, retailPaths } from '@/lib/pos/api';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePosGate } from '@/lib/queries/usePos';
import type {
  AdjustmentReason,
  ProductPhoto,
  RetailNamedItem,
  RetailProduct,
  RetailProductResponse,
  RetailProductSearch,
  StockFilter,
  StockLevelsResponse,
  StockMovementsResponse,
  StocktakeCountResult,
  StocktakeDetail,
  StocktakeScope,
  StocktakesResponse,
} from '@/types/retail';

/**
 * Products and stock in the staff app (POS plan P7-12, P7-13; UX spec §6, §13.6), over the web's
 * `/api/venue/retail/*` routes.
 *
 * THE GATE: every query is disabled unless the venue's `pos_enabled` is on (`usePosGate`), so a
 * venue without POS never sends one of these requests. The stock routes answer only while the
 * venue's Track stock is on; the screens ask them only then.
 *
 * Writes that create something carry a `client_request_id` minted once per form or tap by the
 * caller, so a retry is recorded once. A product edit carries its `version`; a 412
 * `STALE_RESOURCE` carries the fresh product, which replaces the cached one.
 */

const PAGE = 50;

/** The products list (#26), paged on the server. Read only for staff without `manage_products`. */
export function useRetailProducts(
  params: { q: string; archived: 'live' | 'archived' | 'all'; low: boolean },
  options: { enabled?: boolean } = {},
) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const first = retailPaths.products({ q: params.q, archived: params.archived, low: params.low });
  return useInfiniteQuery({
    queryKey: queryKeys.pos.retailProducts(accessToken, first),
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      posFetch<RetailProductSearch>(
        retailPaths.products({ q: params.q, archived: params.archived, low: params.low, offset: pageParam, limit: PAGE }),
        { accessToken: accessToken! },
      ),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? loaded : undefined;
    },
  });
}

/** One product with every option, its barcodes and stock (#26). */
export function useRetailProduct(productId: string | null | undefined, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate((options.enabled ?? true) && Boolean(productId));
  return useQuery({
    queryKey: queryKeys.pos.retailProduct(accessToken, productId ?? null),
    enabled,
    retry: false,
    queryFn: () => posFetch<RetailProductResponse>(retailPaths.product(productId!), { accessToken: accessToken! }),
  });
}

/** The venue's brands or categories (#28), for the editor's pickers. Archived ones are left out. */
export function useRetailNamed(kind: 'brands' | 'categories', options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.retailNamed(accessToken, kind),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<RetailNamedItem[]> => {
      const res = await posFetch<Record<string, unknown>>(retailPaths.named(kind), { accessToken: accessToken! });
      const rows = Array.isArray(res[kind]) ? (res[kind] as { id: unknown; name: unknown }[]) : [];
      return rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
    },
  });
}

/** Refresh every product and stock read after a change. */
function invalidateRetail(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.pos.all(),
    predicate: (q) =>
      q.queryKey[2] === 'retail-products' ||
      q.queryKey[2] === 'retail-product' ||
      q.queryKey[2] === 'stock-levels' ||
      q.queryKey[2] === 'movements' ||
      q.queryKey[2] === 'product-search' ||
      q.queryKey[2] === 'catalogue',
  });
}

/** A product edit refused because someone else saved first: the fresh product is on screen now. */
export class ProductStaleError extends Error {
  constructor(
    message: string,
    readonly product: RetailProduct | null,
  ) {
    super(message);
    this.name = 'ProductStaleError';
  }
}

/**
 * Creates (`POST`, with `client_request_id`) or changes (`PATCH`, with `version`) a product.
 * Answers the product as saved.
 */
export function useSaveProduct() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { kind: 'create'; body: Record<string, unknown>; clientRequestId: string }
        | { kind: 'update'; productId: string; version: number; body: Record<string, unknown> },
    ): Promise<RetailProduct> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      try {
        if (input.kind === 'create') {
          const res = await posFetch<{ product: RetailProduct }>(retailPaths.productsCreate, {
            accessToken,
            method: 'POST',
            body: { ...input.body, client_request_id: input.clientRequestId },
          });
          return res.product;
        }
        const res = await posFetch<{ product: RetailProduct }>(retailPaths.product(input.productId), {
          accessToken,
          method: 'PATCH',
          body: { ...input.body, version: input.version },
        });
        return res.product;
      } catch (error) {
        if (error instanceof ApiError && error.status === 412) {
          const fresh = (error.body as { product?: RetailProduct } | undefined)?.product ?? null;
          if (fresh && input.kind === 'update') {
            queryClient.setQueryData<RetailProductResponse | undefined>(
              queryKeys.pos.retailProduct(accessToken, input.productId),
              (old) => (old ? { ...old, product: fresh } : { product: fresh }),
            );
          }
          throw new ProductStaleError(error.message, fresh);
        }
        throw error;
      }
    },
    onSuccess: (product) => {
      queryClient.setQueryData<RetailProductResponse | undefined>(queryKeys.pos.retailProduct(accessToken, product.id), (old) =>
        old ? { ...old, product } : { product },
      );
      invalidateRetail(queryClient);
    },
  });
}

/** Archives or unarchives a product (`PATCH { version, archived }`). */
export function useArchiveProduct() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { productId: string; version: number; archived: boolean }) => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      const res = await posFetch<{ product: RetailProduct }>(retailPaths.product(input.productId), {
        accessToken,
        method: 'PATCH',
        body: { version: input.version, archived: input.archived },
      });
      return res.product;
    },
    onSuccess: (product) => {
      queryClient.setQueryData<RetailProductResponse | undefined>(queryKeys.pos.retailProduct(accessToken, product.id), (old) =>
        old ? { ...old, product } : { product },
      );
      invalidateRetail(queryClient);
    },
  });
}

/**
 * Deletes a product that has never been sold, counted or received; anything else is archived
 * instead, and the answer says which happened.
 */
export function useDeleteProduct() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<{ deleted: boolean; archived: boolean }>(retailPaths.product(productId), { accessToken, method: 'DELETE' });
    },
    onSuccess: () => invalidateRetail(queryClient),
  });
}

/** Time box for a photo upload: longer than a JSON call. */
const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Adds a photo to a product (#27, multipart `file`, JPG, PNG or WebP under 10 MB, at most eight).
 * Raw fetch, as the app's other image uploads, because `apiFetch` cannot carry FormData; the file
 * goes through `formDataFile` (SDK 56's fetch refuses React Native's `{ uri }` part). Answers the
 * product's photos; a refusal is the server's sentence.
 */
export async function uploadProductPhoto(
  accessToken: string,
  productId: string,
  file: { uri: string; mimeType: string },
): Promise<ProductPhoto[]> {
  const ext = file.mimeType === 'image/png' ? 'png' : file.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const form = new FormData();
  form.append('file', formDataFile(file.uri, `product.${ext}`, file.mimeType));
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, UPLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}${retailPaths.productPhotos(productId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...posHeaders() },
      body: form,
      signal: controller.signal,
    });
  } catch {
    if (timedOut) throw new ApiError('The upload timed out. Check your connection and try again.', 408);
    throw new ApiError('Network request failed. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Upload failed (${response.status})`;
    throw new ApiError(message, response.status, data);
  }
  const photos = (data as { photos?: ProductPhoto[] } | null)?.photos;
  return Array.isArray(photos) ? photos : [];
}

/** Removes the product's photo at position `index` (0 is the main photo). Answers the photos left. */
export async function removeProductPhoto(accessToken: string, productId: string, index: number): Promise<ProductPhoto[]> {
  const res = await posFetch<{ photos?: ProductPhoto[] }>(retailPaths.productPhoto(productId, index), {
    accessToken,
    method: 'DELETE',
  });
  return Array.isArray(res.photos) ? res.photos : [];
}

// ─── Stock (needs Track stock on) ───────────────────────────────────────────

/** Stock levels (#29): one row per counted option of a live product, with the tiles on the first page. */
export function useStockLevels(params: { filter: StockFilter; q: string }, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const first = retailPaths.stock({ filter: params.filter, q: params.q });
  return useInfiniteQuery({
    queryKey: queryKeys.pos.stockLevels(accessToken, first),
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      posFetch<StockLevelsResponse>(
        retailPaths.stock({ filter: params.filter, q: params.q, offset: pageParam, tiles: pageParam === 0 }),
        { accessToken: accessToken! },
      ),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? loaded : undefined;
    },
  });
}

/** Movement history (#29), newest first, for one option or one product. */
export function useStockMovements(
  params: { variantId?: string | null; productId?: string | null },
  options: { enabled?: boolean } = {},
) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const first = retailPaths.movements(params);
  return useInfiniteQuery({
    queryKey: queryKeys.pos.movements(accessToken, first),
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      posFetch<StockMovementsResponse>(retailPaths.movements({ ...params, offset: pageParam }), { accessToken: accessToken! }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? loaded : undefined;
    },
  });
}

/**
 * Adjusts one option's stock (#29, `adjust_stock`): add or remove whole units, or set the count,
 * with a reason. Going below zero is refused with 409 `RETAIL_OUT_OF_STOCK` and the server's
 * sentence. Answers the movement with `on_hand_after`.
 */
export function useAdjustStock() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clientRequestId: string;
      variantId: string;
      mode: 'change' | 'set';
      quantity: number;
      reason: AdjustmentReason;
      note: string | null;
    }) => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<{ movement: { on_hand_after?: number } }>(retailPaths.adjustments, {
        accessToken,
        method: 'POST',
        body: {
          client_request_id: input.clientRequestId,
          variant_id: input.variantId,
          mode: input.mode,
          quantity: input.quantity,
          reason: input.reason,
          ...(input.note ? { note: input.note } : {}),
        },
      });
    },
    onSuccess: () => invalidateRetail(queryClient),
  });
}

// ─── Stocktakes (#30) ────────────────────────────────────────────────────────

export function useStocktakes(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.stocktakes(accessToken),
    enabled,
    queryFn: () => posFetch<StocktakesResponse>(retailPaths.stocktakes, { accessToken: accessToken! }),
  });
}

/**
 * One stocktake: every line, who is counting, and what committing would change. Read every 10
 * seconds while it is open (`poll`), because stocktake tables are not in the realtime publication.
 */
export function useStocktake(id: string | null | undefined, options: { enabled?: boolean; poll?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate((options.enabled ?? true) && Boolean(id));
  return useQuery({
    queryKey: queryKeys.pos.stocktake(accessToken, id ?? null),
    enabled,
    retry: false,
    refetchInterval: options.poll ? 10_000 : false,
    queryFn: () => posFetch<StocktakeDetail>(retailPaths.stocktake(id!), { accessToken: accessToken! }),
  });
}

/** Starts a stocktake (`count_stock`): full, or partial by category or brand. Answers its id. */
export function useStartStocktake() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clientRequestId: string; name: string; scope: StocktakeScope }) => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<{ stocktake_id: string; number: number; replayed: boolean }>(retailPaths.stocktakes, {
        accessToken,
        method: 'POST',
        body: { client_request_id: input.clientRequestId, name: input.name, scope: input.scope },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pos.stocktakes(accessToken) });
    },
  });
}

/**
 * One count event (`count_stock`): "add n" (a scan or +1) or "set to n" (typed). A plain call, so
 * the stocktake screen can keep the event on the phone and send it again with the same request id
 * when the signal comes back. A count outside a partial stocktake is 409 with `out_of_scope`.
 */
export async function postStocktakeCount(
  accessToken: string,
  stocktakeId: string,
  input: { clientRequestId: string; variantId: string; kind: 'add' | 'set'; quantity: number; countAnyway?: boolean },
): Promise<StocktakeCountResult> {
  return posFetch<StocktakeCountResult>(retailPaths.stocktakeAction(stocktakeId, 'counts'), {
    accessToken,
    method: 'POST',
    body: {
      client_request_id: input.clientRequestId,
      variant_id: input.variantId,
      kind: input.kind,
      quantity: input.quantity,
      ...(input.countAnyway ? { count_anyway: true } : {}),
    },
  });
}

/** Whether a count was refused because the option is outside a partial stocktake. */
export function isOutOfScope(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 409) return false;
  return (error.body as { out_of_scope?: unknown } | undefined)?.out_of_scope === true;
}

/** Review, back to counting, commit (`commit_stocktake`) or cancel. Each reads the stocktake again. */
export function useStocktakeAction(stocktakeId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { action: 'status'; version: number; status: 'review' | 'counting' }
        | { action: 'commit'; version: number; zeroUncounted: boolean }
        | { action: 'cancel'; version: number },
    ) => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      const body =
        input.action === 'status'
          ? { version: input.version, status: input.status }
          : input.action === 'commit'
            ? { version: input.version, zero_uncounted: input.zeroUncounted }
            : { version: input.version };
      return posFetch<Record<string, unknown>>(retailPaths.stocktakeAction(stocktakeId, input.action), {
        accessToken,
        method: 'POST',
        body,
        timeoutMs: input.action === 'commit' ? 30_000 : undefined,
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pos.stocktake(accessToken, stocktakeId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.pos.stocktakes(accessToken) });
      invalidateRetail(queryClient);
    },
  });
}

/** The `RETAIL_STALE` / `STALE_RESOURCE` answer to a stocktake or product write. */
export function isStaleRetail(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 412) return false;
  const code = apiErrorCode(error);
  return code === 'STALE_RESOURCE' || code === 'RETAIL_STALE' || code === null;
}
