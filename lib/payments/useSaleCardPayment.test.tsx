/**
 * The sale card collector (POS plan §4.4.3, §4.4.8, P7-1 F2) against the sale API contract. The
 * Terminal SDK is mocked, so this pins:
 * - the `card_app` payment request, then retrieve -> collect -> confirm in order;
 * - the five-minute give-up, which cancels the collection and the attempt on the server;
 * - a decline or a staff cancel releases the sale; an ambiguous confirm never does;
 * - a stale sale is swapped in and nothing is charged.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockToken = 'token-A';
const mockApiFetch = jest.fn();
const mockRetrieve = jest.fn();
const mockCollect = jest.fn();
const mockConfirm = jest.fn();
const mockCancelCollect = jest.fn();

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({ data: { feature_flags: { raw: {}, resolved: { pos_enabled: true } } } }),
}));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});
jest.mock('@/lib/payments/terminal-sdk', () => ({
  ...jest.requireActual<typeof import('@/lib/payments/terminal-sdk')>('@/lib/payments/terminal-sdk'),
  getTerminalSdk: () => ({
    useStripeTerminal: () => ({
      retrievePaymentIntent: mockRetrieve,
      collectPaymentMethod: mockCollect,
      confirmPaymentIntent: mockConfirm,
      cancelCollectPaymentMethod: mockCancelCollect,
    }),
  }),
}));

import { ApiError } from '@/lib/api/client';
import {
  SALE_CARD_COLLECT_TIMEOUT_MS,
  SaleCardError,
  useSaleCardPayment,
} from '@/lib/payments/useSaleCardPayment';
import { makePayment, makeSale } from '@/lib/pos/test-sale';
import { SaleStaleError } from '@/lib/queries/usePos';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const pending = makePayment({ id: 'pay-9', method: 'card_app', status: 'pending', amount_pence: 4000, tip_pence: 400 });
const STARTED = {
  sale: makeSale({ payment_lock_payment_id: 'pay-9', payments: [pending] }),
  payment: pending,
  client_secret: 'cs_1',
};
const INPUT = { clientRequestId: 'req-card-1', version: 3, amountPence: 4000, tipPence: 400 };

/** The calls apiFetch received, as [path, parsed body]. */
function calls(): [string, unknown][] {
  return mockApiFetch.mock.calls.map(([path, init]) => [
    path as string,
    (init as { body?: string }).body ? JSON.parse((init as { body: string }).body) : undefined,
  ]);
}

beforeEach(() => {
  jest.useRealTimers();
  mockApiFetch.mockReset();
  mockRetrieve.mockReset();
  mockCollect.mockReset();
  mockConfirm.mockReset();
  mockCancelCollect.mockReset();
  mockCancelCollect.mockResolvedValue({});
});

describe('useSaleCardPayment', () => {
  it('starts a card_app payment, then drives retrieve -> collect -> confirm in order', async () => {
    const order: string[] = [];
    mockApiFetch.mockImplementation(async () => {
      order.push('payments');
      return STARTED;
    });
    mockRetrieve.mockImplementation(async () => (order.push('retrieve'), { paymentIntent: { id: 'pi_1' } }));
    mockCollect.mockImplementation(async () => (order.push('collect'), { paymentIntent: { id: 'pi_1' } }));
    mockConfirm.mockImplementation(async () => (order.push('confirm'), { paymentIntent: { id: 'pi_1' } }));
    const onCardRead = jest.fn();

    const { result } = await renderHook(() => useSaleCardPayment('sale-1'), { wrapper: wrapper() });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({ ...INPUT, onCardRead });
    });

    expect(order).toEqual(['payments', 'retrieve', 'collect', 'confirm']);
    expect(calls()[0]).toEqual([
      '/api/venue/pos/sales/sale-1/payments',
      { version: 3, client_request_id: 'req-card-1', method: 'card_app', amount_pence: 4000, tip_pence: 400 },
    ]);
    expect(mockRetrieve).toHaveBeenCalledWith('cs_1');
    expect(onCardRead).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ paymentId: 'pay-9', amountPence: 4000, tipPence: 400, alreadyPaid: false });
    // Nothing marks it paid here, and nothing is cancelled.
    expect(calls().some(([p]) => p.endsWith('/cancel'))).toBe(false);
  });

  it('sends no tip_pence when there is no tip', async () => {
    mockApiFetch.mockResolvedValue(STARTED);
    mockRetrieve.mockResolvedValue({ paymentIntent: {} });
    mockCollect.mockResolvedValue({ paymentIntent: {} });
    mockConfirm.mockResolvedValue({ paymentIntent: {} });
    const { result } = await renderHook(() => useSaleCardPayment('sale-1'), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ ...INPUT, tipPence: 0 });
    });
    expect(calls()[0]![1]).not.toHaveProperty('tip_pence');
  });

  it('gives up after five minutes: cancels the collection and its own attempt on the server', async () => {
    jest.useFakeTimers();
    mockApiFetch.mockImplementation(async (path: string) => (path.endsWith('/cancel') ? { sale: makeSale() } : STARTED));
    mockRetrieve.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    let finishCollect: (v: unknown) => void = () => undefined;
    mockCollect.mockImplementation(() => new Promise((resolve) => (finishCollect = resolve)));
    mockCancelCollect.mockImplementation(async () => {
      finishCollect({ error: { code: 'CANCELED', message: 'cancelled' } });
      return {};
    });

    const { result } = await renderHook(() => useSaleCardPayment('sale-1'), { wrapper: wrapper() });
    let caught: unknown;
    let done = false;
    const running = result.current
      .mutateAsync(INPUT)
      .catch((e: unknown) => {
        caught = e;
      })
      .finally(() => {
        done = true;
      });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(SALE_CARD_COLLECT_TIMEOUT_MS - 1000);
    });
    expect(mockCancelCollect).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    for (let i = 0; i < 50 && !done; i += 1) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10);
      });
    }
    await act(async () => {
      await running;
    });

    expect(mockCancelCollect).toHaveBeenCalledTimes(1);
    expect(calls().map(([p]) => p)).toContain('/api/venue/pos/sales/sale-1/payments/pay-9/cancel');
    expect(caught).toBeInstanceOf(SaleCardError);
    expect((caught as SaleCardError).kind).toBe('timed_out');
    expect((caught as SaleCardError).message).toBe('This payment timed out. Start it again.');
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('releases the sale when the card is declined', async () => {
    mockApiFetch.mockImplementation(async (path: string) => (path.endsWith('/cancel') ? { sale: makeSale() } : STARTED));
    mockRetrieve.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockCollect.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockConfirm.mockResolvedValue({
      error: { code: 'DECLINED_BY_STRIPE_API', message: 'Your card was declined.', apiError: { declineCode: 'generic_decline' } },
    });
    const { result } = await renderHook(() => useSaleCardPayment('sale-1'), { wrapper: wrapper() });
    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync(INPUT).catch((e) => (caught = e));
    });
    expect((caught as SaleCardError).kind).toBe('declined');
    expect(calls().map(([p]) => p)).toContain('/api/venue/pos/sales/sale-1/payments/pay-9/cancel');
  });

  it('releases the sale when staff cancel at the reader', async () => {
    mockApiFetch.mockImplementation(async (path: string) => (path.endsWith('/cancel') ? { sale: makeSale() } : STARTED));
    mockRetrieve.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockCollect.mockResolvedValue({ error: { code: 'CANCELED', message: 'cancelled' } });
    const { result } = await renderHook(() => useSaleCardPayment('sale-1'), { wrapper: wrapper() });
    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync(INPUT).catch((e) => (caught = e));
    });
    expect((caught as SaleCardError).kind).toBe('cancelled');
    expect(calls().map(([p]) => p)).toContain('/api/venue/pos/sales/sale-1/payments/pay-9/cancel');
  });

  it('never cancels an ambiguous confirm: the money may have moved', async () => {
    mockApiFetch.mockResolvedValue(STARTED);
    mockRetrieve.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockCollect.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockConfirm.mockResolvedValue({ error: { code: 'REQUEST_TIMED_OUT', message: 'network' } });
    const { result } = await renderHook(() => useSaleCardPayment('sale-1'), { wrapper: wrapper() });
    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync(INPUT).catch((e) => (caught = e));
    });
    expect((caught as SaleCardError).kind).toBe('unsure');
    expect(calls().some(([p]) => p.endsWith('/cancel'))).toBe(false);
  });

  it('treats a cancel the server refuses because it went through as a payment', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.endsWith('/cancel')) {
        throw new ApiError('gone through', 409, { error: 'It went through.', code: 'POS_PAYMENT_NOT_PENDING', sale: makeSale() });
      }
      return STARTED;
    });
    mockRetrieve.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockCollect.mockResolvedValue({ error: { code: 'CANCELED', message: 'cancelled' } });
    const { result } = await renderHook(() => useSaleCardPayment('sale-1'), { wrapper: wrapper() });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync(INPUT);
    });
    expect(out).toMatchObject({ paymentId: 'pay-9', alreadyPaid: true });
  });

  it('stops before asking for a card when staff cancelled while the payment was being made', async () => {
    mockApiFetch.mockImplementation(async (path: string) => (path.endsWith('/cancel') ? { sale: makeSale() } : STARTED));
    const { result } = await renderHook(() => useSaleCardPayment('sale-1'), { wrapper: wrapper() });
    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync({ ...INPUT, shouldStop: () => true }).catch((e) => (caught = e));
    });
    expect((caught as SaleCardError).kind).toBe('cancelled');
    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(calls().map(([p]) => p)).toContain('/api/venue/pos/sales/sale-1/payments/pay-9/cancel');
  });

  it('charges nothing when the sale moved on (412), and hands back the fresh sale', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError('stale', 412, { error: 'Changed.', code: 'POS_SALE_STALE', sale: makeSale({ version: 9 }) }),
    );
    const { result } = await renderHook(() => useSaleCardPayment('sale-1'), { wrapper: wrapper() });
    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync(INPUT).catch((e) => (caught = e));
    });
    expect(caught).toBeInstanceOf(SaleStaleError);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });
});
