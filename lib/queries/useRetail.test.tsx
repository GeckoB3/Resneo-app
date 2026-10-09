/**
 * Products and stock against the web's retail routes (POS plan Appendix E #26 to #30, P7-12):
 * - the gate: with `pos_enabled` off not one `/api/venue/retail` request is made;
 * - a new product carries its request id, an edit its version, and a 412 swaps in the other
 *   person's product and rejects with `ProductStaleError`;
 * - an adjustment sends its reason and request id; a count names its stocktake.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockToken = 'token-A';
const mockApiFetch = jest.fn();
let mockResolved: Record<string, boolean> | undefined = { pos_enabled: true };

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  isBackendConfigured: () => true,
}));
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({ data: mockResolved ? { feature_flags: { raw: {}, resolved: mockResolved } } : undefined }),
}));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import {
  postStocktakeCount,
  ProductStaleError,
  useAdjustStock,
  useRetailProduct,
  useRetailProducts,
  useSaveProduct,
  useStockLevels,
  useStocktakes,
} from '@/lib/queries/useRetail';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, wrapper: Wrapper };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockResolved = { pos_enabled: true };
});

it('asks nothing of the retail routes while the POS switch is off', async () => {
  mockResolved = { pos_enabled: false };
  const { wrapper } = setup();
  const { result } = await renderHook(
    () => ({
      list: useRetailProducts({ q: '', archived: 'live', low: false }),
      one: useRetailProduct('p1'),
      levels: useStockLevels({ filter: 'all', q: '' }),
      takes: useStocktakes(),
    }),
    { wrapper },
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.list.fetchStatus).toBe('idle');
  expect(mockApiFetch).not.toHaveBeenCalled();
});

it('creates a product once per request id, and edits one at its version', async () => {
  const product = { id: 'p1', version: 1, photos: [], variants: [] };
  mockApiFetch.mockResolvedValueOnce({ product, replayed: false });
  const { client, wrapper } = setup();
  const { result } = await renderHook(() => useSaveProduct(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({ kind: 'create', body: { name: 'Shampoo', variants: [] }, clientRequestId: 'req-12345678' });
  });
  expect(mockApiFetch.mock.calls[0]![0]).toBe('/api/venue/retail/products');
  expect(JSON.parse(mockApiFetch.mock.calls[0]![1].body)).toEqual({ name: 'Shampoo', variants: [], client_request_id: 'req-12345678' });
  expect(client.getQueryData(queryKeys.pos.retailProduct(mockToken, 'p1'))).toMatchObject({ product });

  mockApiFetch.mockResolvedValueOnce({ product: { ...product, version: 2 } });
  await act(async () => {
    await result.current.mutateAsync({ kind: 'update', productId: 'p1', version: 1, body: { name: 'Shampoo 2' } });
  });
  expect(mockApiFetch.mock.calls[1]![0]).toBe('/api/venue/retail/products/p1');
  expect(mockApiFetch.mock.calls[1]![1].method).toBe('PATCH');
  expect(JSON.parse(mockApiFetch.mock.calls[1]![1].body)).toEqual({ name: 'Shampoo 2', version: 1 });
});

it("swaps in the other person's product on a 412", async () => {
  const fresh = { id: 'p1', version: 5, name: 'Their name', photos: [], variants: [] };
  mockApiFetch.mockRejectedValueOnce(
    new ApiError("Someone else changed this while you were editing. We've loaded their changes. Check them, then try again.", 412, {
      error: 'x',
      code: 'STALE_RESOURCE',
      product: fresh,
    }),
  );
  const { client, wrapper } = setup();
  const { result } = await renderHook(() => useSaveProduct(), { wrapper });
  let caught: unknown;
  await act(async () => {
    try {
      await result.current.mutateAsync({ kind: 'update', productId: 'p1', version: 3, body: { name: 'Mine' } });
    } catch (e) {
      caught = e;
    }
  });
  expect(caught).toBeInstanceOf(ProductStaleError);
  expect((caught as ProductStaleError).product).toEqual(fresh);
  expect(client.getQueryData(queryKeys.pos.retailProduct(mockToken, 'p1'))).toMatchObject({ product: fresh });
});

it('adjusts stock with a reason and the sheet request id, and counts in the right stocktake', async () => {
  mockApiFetch.mockResolvedValueOnce({ movement: { on_hand_after: 3 } });
  const { wrapper } = setup();
  const { result } = await renderHook(() => useAdjustStock(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({ clientRequestId: 'req-abcdefgh', variantId: 'v1', mode: 'change', quantity: -2, reason: 'damaged', note: null });
  });
  expect(mockApiFetch.mock.calls[0]![0]).toBe('/api/venue/retail/stock/adjustments');
  expect(JSON.parse(mockApiFetch.mock.calls[0]![1].body)).toEqual({
    client_request_id: 'req-abcdefgh',
    variant_id: 'v1',
    mode: 'change',
    quantity: -2,
    reason: 'damaged',
  });

  mockApiFetch.mockResolvedValueOnce({ variant_id: 'v1', counted: 4, counted_at: 'x' });
  await postStocktakeCount('t', 'st1', { clientRequestId: 'req-11111111', variantId: 'v1', kind: 'set', quantity: 4 });
  expect(mockApiFetch.mock.calls[1]![0]).toBe('/api/venue/retail/stocktakes/st1/counts');
  expect(JSON.parse(mockApiFetch.mock.calls[1]![1].body)).toEqual({ client_request_id: 'req-11111111', variant_id: 'v1', kind: 'set', quantity: 4 });
});
