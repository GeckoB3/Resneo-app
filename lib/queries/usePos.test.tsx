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
  myFigures,
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
} from '@/lib/queries/usePos';
import type { PosSale, SalesReport, TakingsReport } from '@/types/pos';

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

describe('saleRefetchInterval', () => {
  it('reads a sale fast while a card is waiting, slowly while open, and not at all when closed', () => {
    expect(saleRefetchInterval(makeSale({ payment_lock_payment_id: 'p' }))).toBe(3000);
    expect(saleRefetchInterval(makeSale())).toBe(20000);
    expect(saleRefetchInterval(makeSale({ status: 'completed' }))).toBe(false);
    expect(saleRefetchInterval(undefined)).toBe(false);
  });
});

describe('myFigures', () => {
  const sales = {
    by_performer: [
      { calendar_id: 'cal-1', staff_id: null, name: 'Sam', services_pence: 5000, retail_pence: 0, other_pence: 0, total_pence: 5000, refunds_pence: 0 },
      { calendar_id: 'cal-2', staff_id: null, name: 'Ali', services_pence: 9000, retail_pence: 0, other_pence: 0, total_pence: 9000, refunds_pence: 0 },
    ],
    by_seller: [
      { calendar_id: null, staff_id: 'staff-1', name: 'Sam', services_pence: 0, retail_pence: 1200, other_pence: 300, total_pence: 1500, refunds_pence: 0 },
    ],
  } as unknown as SalesReport;
  const takings = {
    tips: {
      totals: { allocated_pence: 0, reversed_pence: 0, net_pence: 0, paid_pence: 0, due_pence: 0 },
      by_recipient: [
        { calendar_id: 'cal-1', staff_id: null, name: 'Sam', allocation_kind: 'tip', net_pence: 700, paid_pence: 0, due_pence: 700 },
        { calendar_id: 'cal-2', staff_id: null, name: 'Ali', allocation_kind: 'tip', net_pence: 100, paid_pence: 0, due_pence: 100 },
      ],
    },
  } as unknown as TakingsReport;

  it("adds up this person's services, items and tips, by login or calendar", () => {
    expect(myFigures({ sales, takings }, { staffId: 'staff-1', calendarIds: ['cal-1'] })).toEqual({
      salesPence: 6500,
      tipsPence: 700,
    });
  });

  it('is nothing before either report loads', () => {
    expect(myFigures({ sales: undefined, takings: undefined }, { staffId: 'x', calendarIds: [] })).toBeNull();
  });
});
