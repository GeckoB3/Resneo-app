/**
 * Taking a sale the web till sent to this phone (POS plan §4.36; UX spec §23.5; test plan TTP-02,
 * TTP-03, TTP-08, TTP-09). The Terminal SDK and the API are mocked, so this pins:
 * - the claim carries this phone's device id, the reader type and the tip chosen on the phone;
 * - the phone says it is reading the card before it asks for one;
 * - a decline leaves the payment pending (the same PaymentIntent can be tapped again, TQ12);
 * - the five-minute give-up cancels with `reason: 'timed_out'`;
 * - a payment that has already ended, or another phone's claim, is said in the server's words.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();
const mockRetrieve = jest.fn();
const mockCollect = jest.fn();
const mockConfirm = jest.fn();
const mockCancelCollect = jest.fn();

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({ data: { feature_flags: { raw: {}, resolved: { pos_enabled: true } } } }),
}));
jest.mock('@/lib/pos/collect-device', () => ({ collectDeviceId: async () => 'dev-1' }));
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
import { CollectEndedError, useCollectClaimPayment } from '@/lib/payments/useCollectPayment';
import { SALE_CARD_COLLECT_TIMEOUT_MS, SaleCardError } from '@/lib/payments/useSaleCardPayment';
import type { PosCollectState } from '@/types/pos';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function collect(over: Partial<PosCollectState> = {}): PosCollectState {
  return {
    payment_id: 'pay-7',
    sale_id: 'sale-1',
    status: 'pending',
    collect_state: 'claimed',
    screen: 'claimed',
    for_anyone: false,
    target_staff_id: 'staff-1',
    target_name: 'Jess',
    claimed_by_staff_id: 'staff-1',
    claimed_by_name: 'Jess',
    reader_type: 'tap_to_pay',
    amount_pence: 4500,
    tip_pence: 450,
    card_brand: null,
    card_last4: null,
    failure_code: null,
    failure_message: null,
    expires_at: '2026-10-09T10:02:00Z',
    seconds_left: 0,
    claimed_at: '2026-10-09T10:00:30Z',
    created_at: '2026-10-09T10:00:00Z',
    ...over,
  };
}

const CLAIMED = {
  collect: collect(),
  client_secret: 'cs_7',
  payment_intent_id: 'pi_7',
  stripe_account_id: 'acct_1',
  terminal_location_id: 'tml_1',
  same_device: false,
};

/** The calls apiFetch received, as [path, parsed body]. */
function calls(): [string, unknown][] {
  return mockApiFetch.mock.calls.map(([path, init]) => [
    path as string,
    (init as { body?: string }).body ? JSON.parse((init as { body: string }).body) : undefined,
  ]);
}

function route(responses: Record<string, unknown>) {
  mockApiFetch.mockImplementation(async (path: string) => {
    for (const [suffix, value] of Object.entries(responses)) {
      if (path.endsWith(suffix)) {
        if (value instanceof Error) throw value;
        return value;
      }
    }
    return {};
  });
}

beforeEach(() => {
  jest.useRealTimers();
  mockApiFetch.mockReset();
  mockRetrieve.mockReset().mockResolvedValue({ paymentIntent: { id: 'pi_7' } });
  mockCollect.mockReset().mockResolvedValue({ paymentIntent: { id: 'pi_7' } });
  mockConfirm.mockReset().mockResolvedValue({ paymentIntent: { id: 'pi_7' } });
  mockCancelCollect.mockReset().mockResolvedValue({});
});

describe('useCollectClaimPayment', () => {
  it('claims with this phone, the reader and the tip, says it is collecting, then reads the card', async () => {
    const order: string[] = [];
    mockApiFetch.mockImplementation(async (path: string) => {
      order.push(path.endsWith('/claim') ? 'claim' : path.endsWith('/collect') ? 'collecting' : path);
      return path.endsWith('/claim') ? CLAIMED : {};
    });
    mockRetrieve.mockImplementation(async () => {
      order.push('retrieve');
      return { paymentIntent: { id: 'pi_7' } };
    });
    mockCollect.mockImplementation(async () => {
      order.push('collect');
      return { paymentIntent: { id: 'pi_7' } };
    });
    const { result } = await renderHook(() => useCollectClaimPayment('pay-7'), { wrapper: wrapper() });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({ readerType: 'tap_to_pay', tipPence: 450 });
    });
    expect(order).toEqual(['claim', 'retrieve', 'collecting', 'collect']);
    expect(calls()[0]).toEqual([
      '/api/venue/pos/payments/pay-7/claim',
      { device_id: 'dev-1', reader_type: 'tap_to_pay', tip_pence: 450 },
    ]);
    expect(calls()[1]).toEqual(['/api/venue/pos/payments/pay-7/collect', { device_id: 'dev-1', state: 'collecting' }]);
    expect(mockRetrieve).toHaveBeenCalledWith('cs_7');
    expect(out).toMatchObject({ paymentId: 'pay-7', amountPence: 4500, tipPence: 450, saleId: 'sale-1', alreadyPaid: false });
    expect(calls().some(([p]) => p.endsWith('/cancel'))).toBe(false);
  });

  it('claims a WisePad 3 payment as wisepad', async () => {
    route({ '/claim': CLAIMED });
    const { result } = await renderHook(() => useCollectClaimPayment('pay-7'), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ readerType: 'wisepad', tipPence: 0 });
    });
    expect(calls()[0]![1]).toMatchObject({ reader_type: 'wisepad', tip_pence: 0 });
  });

  it('keeps the payment open after a decline, so the same PaymentIntent can be tried again', async () => {
    route({ '/claim': CLAIMED });
    mockConfirm.mockResolvedValue({
      error: { code: 'DECLINED_BY_STRIPE_API', message: 'Your card was declined.', apiError: { declineCode: 'offline_pin_required' } },
    });
    const { result } = await renderHook(() => useCollectClaimPayment('pay-7'), { wrapper: wrapper() });
    let caught: unknown;
    await act(async () => {
      caught = await result.current.mutateAsync({ readerType: 'tap_to_pay', tipPence: 0 }).catch((e: unknown) => e);
    });
    expect(caught).toBeInstanceOf(SaleCardError);
    expect((caught as SaleCardError).kind).toBe('declined');
    expect((caught as SaleCardError).codes.declineCode).toBe('offline_pin_required');
    expect(calls().some(([p]) => p.endsWith('/cancel'))).toBe(false);
  });

  it('gives up after five minutes and cancels with reason timed_out', async () => {
    jest.useFakeTimers();
    route({ '/claim': CLAIMED, '/cancel': { collect: collect({ status: 'cancelled', screen: 'timed_out' }) } });
    let finishCollect: (v: unknown) => void = () => undefined;
    mockCollect.mockImplementation(() => new Promise((resolve) => (finishCollect = resolve)));
    mockCancelCollect.mockImplementation(async () => {
      finishCollect({ error: { code: 'CANCELED', message: 'cancelled' } });
      return {};
    });
    const { result } = await renderHook(() => useCollectClaimPayment('pay-7'), { wrapper: wrapper() });
    let caught: unknown;
    let done = false;
    const running = result.current
      .mutateAsync({ readerType: 'tap_to_pay', tipPence: 0 })
      .catch((e: unknown) => {
        caught = e;
      })
      .finally(() => {
        done = true;
      });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(mockCancelCollect).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(SALE_CARD_COLLECT_TIMEOUT_MS);
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
    expect(calls().find(([p]) => p.endsWith('/cancel'))).toEqual(['/api/venue/pos/payments/pay-7/cancel', { reason: 'timed_out' }]);
    expect((caught as SaleCardError).kind).toBe('timed_out');
  });

  it('says so, and reads no card, when the payment has already ended', async () => {
    route({ '/claim': { ...CLAIMED, client_secret: null, collect: collect({ status: 'cancelled', screen: 'cancelled' }) } });
    const { result } = await renderHook(() => useCollectClaimPayment('pay-7'), { wrapper: wrapper() });
    let caught: unknown;
    await act(async () => {
      caught = await result.current.mutateAsync({ readerType: 'tap_to_pay', tipPence: 0 }).catch((e: unknown) => e);
    });
    expect(caught).toBeInstanceOf(CollectEndedError);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("hands back another phone's claim in the server's own words", async () => {
    const sentence = 'Jess has already taken this payment on their phone.';
    route({ '/claim': new ApiError(sentence, 409, { error: sentence, code: 'POS_PAYMENT_CLAIMED' }) });
    const { result } = await renderHook(() => useCollectClaimPayment('pay-7'), { wrapper: wrapper() });
    let caught: unknown;
    await act(async () => {
      caught = await result.current.mutateAsync({ readerType: 'tap_to_pay', tipPence: 0 }).catch((e: unknown) => e);
    });
    expect((caught as Error).message).toBe(sentence);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });
});
