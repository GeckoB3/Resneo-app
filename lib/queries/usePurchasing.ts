import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/client';
import { posFetch, retailPaths } from '@/lib/pos/api';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePosGate } from '@/lib/queries/usePos';
import type {
  PickerVariant,
  PurchaseOrderDetail,
  PurchaseOrdersResponse,
  ReceiveResult,
  RetailSupplier,
} from '@/types/retail';

/**
 * Suppliers, purchase orders and "Use stock" in the app (POS app step 4b, plan P7-15; UX spec §6.12
 * to §6.14, §13.6), over the web's Pass 5 routes (`/api/venue/retail/suppliers`,
 * `/purchase-orders/**`, `/variants`, `/usage`). Behind the same POS gate as every POS query, and
 * asked only while Track stock is on (the routes answer 403 `feature_disabled` otherwise).
 *
 * Creating an order, receiving a delivery and recording use carry a `client_request_id` minted
 * once per sheet by the caller. Changing an order carries its `version`; a 412 `STALE_RESOURCE`
 * reads the order again (`PurchaseOrderStaleError`).
 */

/** The venue's suppliers, by name (adding and changing them stays on the web). */
export function useSuppliers(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.suppliers(accessToken),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<RetailSupplier[]> => {
      const res = await posFetch<{ suppliers?: RetailSupplier[] }>(retailPaths.named('suppliers'), { accessToken: accessToken! });
      return Array.isArray(res.suppliers) ? res.suppliers : [];
    },
  });
}

/** Purchase orders, newest first, paged on the server. */
export function usePurchaseOrders(status: string, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const first = retailPaths.purchaseOrders({ status });
  return useInfiniteQuery({
    queryKey: queryKeys.pos.purchaseOrders(accessToken, first),
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      posFetch<PurchaseOrdersResponse>(retailPaths.purchaseOrders({ status, offset: pageParam }), { accessToken: accessToken! }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? loaded : undefined;
    },
  });
}

/** One order: its supplier, lines (with stock and barcodes, for receiving), deliveries and sender. */
export function usePurchaseOrder(id: string | null | undefined, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate((options.enabled ?? true) && Boolean(id));
  return useQuery({
    queryKey: queryKeys.pos.purchaseOrder(accessToken, id ?? null),
    enabled,
    retry: false,
    queryFn: () => posFetch<PurchaseOrderDetail>(retailPaths.purchaseOrder(id!), { accessToken: accessToken! }),
  });
}

/** The picker for orders (`purpose=order`, a supplier's products first) and Use stock (`purpose=use`). */
export function useVariantPicker(
  params: { q: string; purpose: 'use' | 'order'; supplierId?: string | null },
  options: { enabled?: boolean } = {},
) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const path = retailPaths.variants(params);
  return useQuery({
    queryKey: queryKeys.pos.variantPicker(accessToken, path),
    enabled,
    staleTime: 15_000,
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<PickerVariant[]> => {
      const res = await posFetch<{ items?: PickerVariant[] }>(path, { accessToken: accessToken! });
      return Array.isArray(res.items) ? res.items : [];
    },
  });
}

/** A change to an order refused because someone else saved first; the order has been read again. */
export class PurchaseOrderStaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PurchaseOrderStaleError';
  }
}

function invalidatePurchasing(queryClient: QueryClient, accessToken: string | null, id?: string | null): void {
  if (id) void queryClient.invalidateQueries({ queryKey: queryKeys.pos.purchaseOrder(accessToken, id) });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.pos.all(),
    predicate: (q) =>
      q.queryKey[2] === 'purchase-orders' ||
      q.queryKey[2] === 'stock-levels' ||
      q.queryKey[2] === 'movements' ||
      q.queryKey[2] === 'retail-products' ||
      q.queryKey[2] === 'retail-product' ||
      q.queryKey[2] === 'product-search' ||
      q.queryKey[2] === 'variant-picker',
  });
}

/**
 * Starts a draft for a supplier (`manage_purchase_orders`): empty, or with `suggest` filled with
 * everything from that supplier at or below its reorder level. Answers its id, and with `suggest`
 * how many lines were added.
 */
export function useCreatePurchaseOrder() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clientRequestId: string; supplierId: string; suggest: boolean }) => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<{ purchase_order_id: string; number: number; version: number; suggested?: number; below_minimum?: boolean }>(
        retailPaths.purchaseOrdersCreate,
        {
          accessToken,
          method: 'POST',
          body: { client_request_id: input.clientRequestId, supplier_id: input.supplierId, ...(input.suggest ? { suggest: true } : {}) },
        },
      );
    },
    onSuccess: () => invalidatePurchasing(queryClient, accessToken),
  });
}

/**
 * Changes a draft (`PATCH` with its `version`): the whole list of lines, the expected date and the
 * notes. A 412 reads the order again and rejects with `PurchaseOrderStaleError`.
 */
export function useUpdatePurchaseOrder(id: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      version: number;
      lines?: { variant_id: string; quantity: number; unit_cost_pence: number | null }[];
      expected_on?: string | null;
      notes?: string | null;
    }) => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      try {
        return await posFetch<{ version: number; total_cost_pence: number; status: string }>(retailPaths.purchaseOrder(id), {
          accessToken,
          method: 'PATCH',
          body: input,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 412) {
          await queryClient.invalidateQueries({ queryKey: queryKeys.pos.purchaseOrder(accessToken, id) });
          throw new PurchaseOrderStaleError(error.message);
        }
        throw error;
      }
    },
    onSuccess: () => invalidatePurchasing(queryClient, accessToken, id),
  });
}

/** Send to the supplier, cancel, or add the suggested lines to a draft. Each reads the order again. */
export function usePurchaseOrderAction(id: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { action: 'send' | 'cancel'; version: number } | { action: 'suggest' }) => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<Record<string, unknown> & { added?: number; version?: number }>(retailPaths.purchaseOrderAction(id, input.action), {
        accessToken,
        method: 'POST',
        body: input.action === 'suggest' ? {} : { version: input.version },
        timeoutMs: input.action === 'send' ? 30_000 : undefined,
      });
    },
    onSettled: () => invalidatePurchasing(queryClient, accessToken, id),
  });
}

/**
 * Receives a delivery (`receive_stock`): the lines that arrived and anything that was not ordered,
 * with the sheet's request id and the order's version. A replay answers the first receipt.
 */
export function useReceivePurchaseOrder(id: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clientRequestId: string;
      version: number;
      deliveryRef: string | null;
      lines: { line_id: string; quantity: number; unit_cost_pence?: number }[];
      extras: { variant_id: string; quantity: number; unit_cost_pence?: number }[];
    }): Promise<ReceiveResult> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<ReceiveResult>(retailPaths.purchaseOrderAction(id, 'receive'), {
        accessToken,
        method: 'POST',
        timeoutMs: 30_000,
        body: {
          client_request_id: input.clientRequestId,
          version: input.version,
          ...(input.deliveryRef ? { delivery_ref: input.deliveryRef } : {}),
          lines: input.lines,
          extras: input.extras,
        },
      });
    },
    onSettled: () => invalidatePurchasing(queryClient, accessToken, id),
  });
}

/**
 * "Use stock" (`record_professional_use`): whole units of a product used in treatments, tied to a
 * booking when one is chosen. Using more than is in stock is 409 with the server's sentence.
 */
export function useRecordUse() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clientRequestId: string; variantId: string; quantity: number; bookingId: string | null; note: string | null }) => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<{ movement: Record<string, unknown> }>(retailPaths.usage, {
        accessToken,
        method: 'POST',
        body: {
          client_request_id: input.clientRequestId,
          variant_id: input.variantId,
          quantity: input.quantity,
          ...(input.bookingId ? { booking_id: input.bookingId } : {}),
          ...(input.note ? { note: input.note } : {}),
        },
      });
    },
    onSuccess: () => invalidatePurchasing(queryClient, accessToken),
  });
}
