/**
 * Card / cash / refund call mapping against the charge route contract
 * (Tap to Pay design doc §6.3, §7.7). The Terminal SDK is mocked, so this pins
 * the request bodies and the retrieve -> collect -> confirm ordering without a
 * native build.
 *
 * jest hoists mock factories above imports, so every closed-over variable is
 * prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockToken = 'token-A';
const mockApiFetch = jest.fn();

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

// Terminal SDK stand-in: the real package throws on import without the native
// module, which is exactly why the app loads it lazily (see terminal-sdk.ts).
const mockRetrieve = jest.fn();
const mockCollect = jest.fn();
const mockConfirm = jest.fn();
jest.mock('@/lib/payments/terminal-sdk', () => ({
  ...jest.requireActual<typeof import('@/lib/payments/terminal-sdk')>(
    '@/lib/payments/terminal-sdk',
  ),
  getTerminalSdk: () => ({
    useStripeTerminal: () => ({
      retrievePaymentIntent: mockRetrieve,
      collectPaymentMethod: mockCollect,
      confirmPaymentIntent: mockConfirm,
    }),
  }),
}));

import {
  useRecordExternalPayment,
  useRefundPayment,
  useTakePayment,
} from '@/lib/queries/useTakePayment';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const ATTEMPT = '3f4a2c1e-9b7d-4a55-8c21-0f9e2d5a7b31';

beforeEach(() => {
  mockApiFetch.mockReset();
  mockRetrieve.mockReset();
  mockCollect.mockReset();
  mockConfirm.mockReset();
});

describe('useTakePayment (card_present)', () => {
  it('POSTs the charge, then drives retrieve -> collect -> confirm in order', async () => {
    const order: string[] = [];
    mockApiFetch.mockImplementation(async () => {
      order.push('charge');
      return { payment_intent_id: 'pi_1', client_secret: 'cs_1', amount_pence: 2500 };
    });
    const intent = { id: 'pi_1' };
    mockRetrieve.mockImplementation(async () => {
      order.push('retrieve');
      return { paymentIntent: intent };
    });
    mockCollect.mockImplementation(async () => {
      order.push('collect');
      return { paymentIntent: intent };
    });
    mockConfirm.mockImplementation(async () => {
      order.push('confirm');
      return { paymentIntent: intent };
    });

    const { result } = await renderHook(() => useTakePayment('bk-1'), { wrapper: wrapper() });
    const res = await result.current.mutateAsync({
      attemptId: ATTEMPT,
      amountPence: 2500,
      readerType: 'tap_to_pay',
    });

    expect(order).toEqual(['charge', 'retrieve', 'collect', 'confirm']);
    expect(res.amountPence).toBe(2500);

    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/bookings/bk-1/charge');
    expect((opts as { method: string }).method).toBe('POST');
    expect(JSON.parse((opts as { body: string }).body)).toEqual({
      method: 'card_present',
      attempt_id: ATTEMPT,
      amount_pence: 2500,
      reader_type: 'tap_to_pay',
    });
    // The reader is handed the server's client secret, never a client-made one.
    expect(mockRetrieve).toHaveBeenCalledWith('cs_1');
  });

  it('omits amount_pence so the server charges the full balance', async () => {
    mockApiFetch.mockResolvedValue({
      payment_intent_id: 'pi_1',
      client_secret: 'cs_1',
      amount_pence: 4000,
    });
    const intent = { id: 'pi_1' };
    mockRetrieve.mockResolvedValue({ paymentIntent: intent });
    mockCollect.mockResolvedValue({ paymentIntent: intent });
    mockConfirm.mockResolvedValue({ paymentIntent: intent });

    const { result } = await renderHook(() => useTakePayment('bk-1'), { wrapper: wrapper() });
    await result.current.mutateAsync({ attemptId: ATTEMPT });

    const body = JSON.parse((mockApiFetch.mock.calls[0]![1] as { body: string }).body);
    expect(body).toEqual({ method: 'card_present', attempt_id: ATTEMPT });
    expect(body.amount_pence).toBeUndefined();
  });

  it('surfaces a reader error and never confirms', async () => {
    mockApiFetch.mockResolvedValue({
      payment_intent_id: 'pi_1',
      client_secret: 'cs_1',
      amount_pence: 2500,
    });
    mockRetrieve.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockCollect.mockResolvedValue({ error: { message: 'The card was declined.' } });

    const { result } = await renderHook(() => useTakePayment('bk-1'), { wrapper: wrapper() });
    await expect(
      result.current.mutateAsync({ attemptId: ATTEMPT }),
    ).rejects.toThrow('The card was declined.');
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('fails fast when the server returns no client secret', async () => {
    mockApiFetch.mockResolvedValue({
      payment_intent_id: 'pi_1',
      client_secret: null,
      amount_pence: 2500,
    });
    const { result } = await renderHook(() => useTakePayment('bk-1'), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ attemptId: ATTEMPT })).rejects.toThrow();
    expect(mockRetrieve).not.toHaveBeenCalled();
  });
});

describe('useRecordExternalPayment', () => {
  it('POSTs cash with the amount and note, and never touches Stripe', async () => {
    mockApiFetch.mockResolvedValue({ success: true });
    const { result } = await renderHook(() => useRecordExternalPayment('bk-1'), {
      wrapper: wrapper(),
    });
    await result.current.mutateAsync({ method: 'cash', amountPence: 1500, note: 'tip jar' });

    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/bookings/bk-1/charge');
    expect(JSON.parse((opts as { body: string }).body)).toEqual({
      method: 'cash',
      amount_pence: 1500,
      note: 'tip jar',
    });
    expect(mockRetrieve).not.toHaveBeenCalled();
  });
});

describe('useRefundPayment', () => {
  it('POSTs the refund action with the ledger row id', async () => {
    mockApiFetch.mockResolvedValue({ success: true });
    const { result } = await renderHook(() => useRefundPayment('bk-1'), { wrapper: wrapper() });
    await result.current.mutateAsync({ paymentId: 'pay-1' });

    expect(JSON.parse((mockApiFetch.mock.calls[0]![1] as { body: string }).body)).toEqual({
      action: 'refund',
      payment_id: 'pay-1',
    });
  });
});

describe('cache invalidation', () => {
  it('refetches the booking after a successful cash payment', async () => {
    mockApiFetch.mockResolvedValue({ success: true });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const spy = jest.spyOn(client, 'invalidateQueries');
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = await renderHook(() => useRecordExternalPayment('bk-1'), { wrapper: Wrapper });
    await result.current.mutateAsync({ method: 'cash', amountPence: 100 });

    // The webhook owns paid state; the client only invalidates so the refetch
    // shows the truth.
    await waitFor(() => expect(spy).toHaveBeenCalled());
  });
});
