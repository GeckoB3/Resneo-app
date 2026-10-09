/**
 * Checkout's queries and writes against the sale API contract (POS plan Appendix E, P7-1):
 * - the gate: with `pos_enabled` off (or missing) not one `/api/venue/pos` request is made;
 * - starting a sale sends the request id, the source and `channel: 'app'`;
 * - every sale write's answer replaces the cached sale, and a 412 POS_SALE_STALE swaps in the
 *   fresh sale it carries and rejects with `SaleStaleError`;
 * - "Your sales and tips" picks this person's figures out of the reports.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
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
import { makeSale } from '@/lib/pos/test-sale';
import { queryKeys } from '@/lib/queries/keys';
import {
  lookupBarcode,
  lookupVoucher,
  saleRefetchInterval,
  SaleStaleError,
  usePosBootstrap,
  usePosEnabled,
  usePosQueue,
  usePosReportAccess,
  usePosSale,
  usePosSaleList,
  useSaleWrite,
  useStartSale,
  useVoucherSettings,
  useAdjustLoyalty,
  useMyCommission,
  useProductSearch,
  useSaleRewards,
} from '@/lib/queries/usePos';
import type { PosSale } from '@/types/pos';

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

describe('the POS gate', () => {
  it.each([
    ['off', { pos_enabled: false }],
    ['missing (an older web deploy)', { waitlist_v2: true }],
    ['not loaded', undefined],
  ])('makes no /api/venue/pos request when the switch is %s', async (_label, resolved) => {
    mockResolved = resolved as Record<string, boolean> | undefined;
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({
        enabled: usePosEnabled(),
        boot: usePosBootstrap(),
        queue: usePosQueue(),
        list: usePosSaleList({ status: 'open' }),
        sale: usePosSale('sale-1'),
        access: usePosReportAccess(),
      }),
      { wrapper },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.enabled).toBe(false);
    expect(result.current.boot.fetchStatus).toBe('idle');
    expect(result.current.sale.fetchStatus).toBe('idle');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('loads the bootstrap with the POS client headers when the switch is on', async () => {
    mockApiFetch.mockResolvedValue({ capabilities: {}, settings: {} });
    const { wrapper } = setup();
    const { result } = await renderHook(() => usePosBootstrap(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [path, init] = mockApiFetch.mock.calls[0] as [string, { accessToken: string; headers: Record<string, string> }];
    expect(path).toBe('/api/venue/pos/bootstrap');
    expect(init.accessToken).toBe(mockToken);
    expect(init.headers['X-ResNeo-Client']).toMatch(/^(ios|android|web)/);
    expect(init.headers['x-pos-device']).toBeTruthy();
  });
});

describe('useStartSale', () => {
  it('sends the request id, the booking and the app channel, and caches the sale', async () => {
    const sale = makeSale({ id: 'sale-9' });
    mockApiFetch.mockResolvedValue({ sale, created: false });
    const { wrapper, client } = setup();
    const { result } = await renderHook(() => useStartSale(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        clientRequestId: 'req-12345678',
        source: { type: 'booking', booking_id: 'b-1' },
      });
    });
    const [path, init] = mockApiFetch.mock.calls[0] as [string, { method: string; body: string }];
    expect(path).toBe('/api/venue/pos/sales');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      client_request_id: 'req-12345678',
      source: { type: 'booking', booking_id: 'b-1' },
      channel: 'app',
    });
    expect(client.getQueryData(queryKeys.pos.sale(mockToken, 'sale-9'))).toEqual(sale);
  });

  it('starts a blank sale', async () => {
    mockApiFetch.mockResolvedValue({ sale: makeSale() });
    const { wrapper } = setup();
    const { result } = await renderHook(() => useStartSale(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ clientRequestId: 'req-abcdefgh', source: { type: 'blank' } });
    });
    const body = JSON.parse((mockApiFetch.mock.calls[0] as [string, { body: string }])[1].body);
    expect(body.source).toEqual({ type: 'blank' });
  });
});

describe('useSaleWrite', () => {
  it('posts a cash payment with its version and request id, and caches the answer', async () => {
    const after = makeSale({ version: 4, status: 'completed', balance_due_pence: 0 });
    mockApiFetch.mockResolvedValue({ sale: after, payment: null, change_given_pence: 450 });
    const { wrapper, client } = setup();
    const { result } = await renderHook(() => useSaleWrite('sale-1'), { wrapper });
    let answer: unknown;
    await act(async () => {
      answer = await result.current.mutateAsync({
        action: 'payments',
        money: true,
        body: { version: 3, client_request_id: 'req-cash-1', method: 'cash', amount_pence: 3550, cash_tendered_pence: 4000 },
      });
    });
    const [path, init] = mockApiFetch.mock.calls[0] as [string, { method: string; body: string }];
    expect(path).toBe('/api/venue/pos/sales/sale-1/payments');
    expect(JSON.parse(init.body)).toMatchObject({ version: 3, client_request_id: 'req-cash-1', method: 'cash' });
    expect((answer as { change_given_pence: number }).change_given_pence).toBe(450);
    expect(client.getQueryData(queryKeys.pos.sale(mockToken, 'sale-1'))).toEqual(after);
  });

  it('swaps in the fresh sale a 412 carries and rejects with SaleStaleError', async () => {
    const fresh = makeSale({ version: 7 });
    mockApiFetch.mockRejectedValue(
      new ApiError('stale', 412, { error: 'This sale was changed on another device.', code: 'POS_SALE_STALE', sale: fresh }),
    );
    const { wrapper, client } = setup();
    const { result } = await renderHook(() => useSaleWrite('sale-1'), { wrapper });
    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({ action: 'park', body: { version: 3 } });
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toBeInstanceOf(SaleStaleError);
    expect((caught as SaleStaleError).sale.version).toBe(7);
    expect((client.getQueryData(queryKeys.pos.sale(mockToken, 'sale-1')) as PosSale).version).toBe(7);
  });

  it("passes other refusals through with the server's sentence", async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError("That's more than your 10% discount limit.", 403, {
        error: "That's more than your 10% discount limit.",
        code: 'POS_DISCOUNT_APPROVAL_REQUIRED',
      }),
    );
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSaleWrite('sale-1'), { wrapper });
    await expect(
      act(async () => {
        await result.current.mutateAsync({ action: 'discounts', body: { version: 3 } });
      }),
    ).rejects.toThrow("That's more than your 10% discount limit.");
  });
});

describe('gift vouchers (Pass V)', () => {
  it('reads vouchers as off when the voucher settings are refused', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('off', 403, { error: 'off', code: 'feature_disabled' }));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useVoucherSettings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(mockApiFetch.mock.calls[0]![0]).toBe('/api/venue/pos/voucher-settings');
  });

  it('asks for no voucher settings while the POS switch is off', async () => {
    mockResolved = { pos_enabled: false };
    const { wrapper } = setup();
    await renderHook(() => useVoucherSettings(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('sends a code only in the body of the look-up, never in the address', async () => {
    mockApiFetch.mockResolvedValue({ voucher: { id: 'v1', code_last4: '9HPA', status: 'active', balance_pence: 100, initial_pence: 100, expires_at: null } });
    const voucher = await lookupVoucher(mockToken, '7K4QM2XD9HPA');
    expect(voucher.id).toBe('v1');
    const [path, init] = mockApiFetch.mock.calls[0] as [string, { method: string; body: string }];
    expect(path).toBe('/api/venue/pos/vouchers/lookup');
    expect(path).not.toContain('7K4Q');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ code: '7K4QM2XD9HPA' });
  });
});

describe('saleRefetchInterval', () => {
  it('reads a sale fast while a card is waiting, slowly while open, and not at all when closed', () => {
    expect(saleRefetchInterval(makeSale({ payment_lock_payment_id: 'p' }))).toBe(3000);
    expect(saleRefetchInterval(makeSale())).toBe(20000);
    expect(saleRefetchInterval(makeSale({ status: 'completed' }))).toBe(false);
    expect(saleRefetchInterval(undefined)).toBe(false);
  });
});

describe('Your sales and tips (Pass LC, UX spec §22.3)', () => {
  it("reads this person's own figures from the commission report, for the period chosen", async () => {
    mockApiFetch.mockResolvedValueOnce({
      mine: { period: 'week', from: '2026-10-05', to: '2026-10-09', sales_pence: 6500, tips_pence: 700, commission_pence: null },
      can: { see_commission: false },
      venue: { name: 'Studio', currency: 'GBP' },
    });
    const { wrapper } = setup();
    const { result } = await renderHook(() => useMyCommission('week'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch.mock.calls[0]![0]).toBe('/api/venue/pos/commission/report?mine=1&period=week');
    expect(result.current.data?.mine.sales_pence).toBe(6500);
    expect(result.current.data?.mine.commission_pence).toBeNull();
  });

  it('reads a server without the route (before Pass LC) as nothing to show', async () => {
    mockApiFetch.mockRejectedValueOnce(new ApiError('Not found', 404, { error: 'Not found' }));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useMyCommission('today'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('products at the till (app step 4, UX spec §3.8)', () => {
  it('searches products on the server', async () => {
    mockApiFetch.mockResolvedValueOnce({ services: [], favourites: [], products: [], stock: { track_stock: true, sell_beyond_stock: true } });
    const { wrapper } = setup();
    const { result } = await renderHook(() => useProductSearch('shampoo'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch.mock.calls[0]![0]).toBe('/api/venue/pos/catalogue?type=products&q=shampoo');
  });

  it('looks a scanned barcode up exactly, and tells an unknown code from one the till may not sell', async () => {
    const product = {
      id: 'p1',
      name: 'Shampoo',
      brand_name: null,
      restriction: 'none',
      options: [{ id: 'v1', name: null, sku: null, price_pence: 1200, track_stock: true, on_hand: 3, available: 3 }],
    };
    mockApiFetch.mockResolvedValueOnce({ product, option_id: 'v1' });
    await expect(lookupBarcode('t', '5012345678900')).resolves.toEqual({ hit: { product, option_id: 'v1' } });
    expect(mockApiFetch.mock.calls[0]![0]).toBe('/api/venue/pos/catalogue?barcode=5012345678900');

    mockApiFetch.mockRejectedValueOnce(new ApiError('No product', 404, { error: 'No product has the barcode 123.', code: 'NOT_FOUND' }));
    await expect(lookupBarcode('t', '1234')).resolves.toEqual({ unknown: true });

    const sentence = 'Shampoo is archived. Unarchive it in Products to sell it.';
    mockApiFetch.mockRejectedValueOnce(new ApiError(sentence, 404, { error: sentence, code: 'NOT_FOUND', reason: 'archived' }));
    await expect(lookupBarcode('t', '9999')).resolves.toEqual({ refused: sentence });
  });
});

describe('loyalty cards (Pass LC, UX spec §21)', () => {
  it("adjusts stamps with the form's request id and keeps the card it answers", async () => {
    const card = { programme: null, stamps: 4, needed: 6, rewards: [], available: [], history: [] };
    mockApiFetch.mockResolvedValueOnce({ card, issued_reward_ids: [] });
    const { client, wrapper } = setup();
    const { result } = await renderHook(() => useAdjustLoyalty('guest-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ delta: 2, reason: 'Carried over from a paper card', clientRequestId: 'req-12345678' });
    });
    const [path, init] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/guests/guest-1/loyalty-card/adjust');
    expect(JSON.parse(init.body)).toEqual({ delta: 2, reason: 'Carried over from a paper card', client_request_id: 'req-12345678' });
    expect(client.getQueryData(queryKeys.pos.loyaltyCard(mockToken, 'guest-1'))).toMatchObject({ card });
  });

  it('asks nothing while loyalty is off for the sale', async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSaleRewards('sale-1', { enabled: false }), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
