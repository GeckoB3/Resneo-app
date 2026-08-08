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
  failedCardAttempts,
  __resetFailedCardAttemptsForTests,
} from '@/lib/payments/failed-attempts';
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
  __resetFailedCardAttemptsForTests();
});

/** The charge response for a £25 card attempt. */
const CHARGE = { payment_intent_id: 'pi_1', client_secret: 'cs_1', amount_pence: 2500 };

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

describe('a card attempt this client watches fail', () => {
  /**
   * The pending ledger row is written when the PaymentIntent is created, and ONLY
   * the Stripe webhook can move it off `pending`. A decline therefore leaves the
   * row looking in-flight — which is what warned staff "a card payment is still
   * going through" for minutes after a tap they had watched be refused.
   */
  it('records the decline so the sheet stops warning about it', async () => {
    mockApiFetch.mockResolvedValue(CHARGE);
    mockRetrieve.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockCollect.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockConfirm.mockResolvedValue({
      error: { message: 'The card was declined.', apiError: { declineCode: 'generic_decline' } },
    });

    const { result } = await renderHook(() => useTakePayment('bk-1'), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ attemptId: ATTEMPT })).rejects.toThrow(
      'The card was declined.',
    );

    expect(failedCardAttempts()).toEqual([
      expect.objectContaining({
        bookingId: 'bk-1',
        paymentIntentId: 'pi_1',
        amountPence: 2500,
      }),
    ]);
  });

  it('records a card the reader refused before the confirm step', async () => {
    mockApiFetch.mockResolvedValue(CHARGE);
    mockRetrieve.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockCollect.mockResolvedValue({
      error: { message: 'The card was not read.', paymentIntent: { status: 'requiresPaymentMethod' } },
    });

    const { result } = await renderHook(() => useTakePayment('bk-1'), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ attemptId: ATTEMPT })).rejects.toThrow();

    expect(failedCardAttempts()).toHaveLength(1);
  });

  it('does NOT record an ambiguous failure, because Stripe may have captured', async () => {
    /**
     * The important negative. A confirm that failed on the network says nothing
     * about whether the money moved, so the warning has to stay up — the app must
     * never quietly tell staff a payment failed when it may have succeeded.
     */
    mockApiFetch.mockResolvedValue(CHARGE);
    mockRetrieve.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockCollect.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockConfirm.mockResolvedValue({
      error: { code: 'REQUEST_TIMED_OUT', message: 'The payment could not be confirmed.' },
    });

    const { result } = await renderHook(() => useTakePayment('bk-1'), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ attemptId: ATTEMPT })).rejects.toThrow();

    expect(failedCardAttempts()).toEqual([]);
  });

  /**
   * Reported on device: staff cancelled at the reader, then the next attempt still
   * said "a card payment of £1 started a while ago and still has not been
   * confirmed". Two things were wrong — the SDK's own `CANCELED` error carries no
   * PaymentIntent, so it read as ambiguous; and even once discounted locally, the
   * row stayed `pending` for the web dashboard, a colleague's phone, and this app
   * after a restart. Cancelling the intent server-side is what actually settles it.
   */
  it('cancels the intent server-side when staff abandon the collection', async () => {
    mockApiFetch.mockResolvedValue(CHARGE);
    mockRetrieve.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockCollect.mockResolvedValue({ error: { code: 'CANCELED', message: 'Canceled' } });

    const { result } = await renderHook(() => useTakePayment('bk-1'), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ attemptId: ATTEMPT })).rejects.toThrow();

    expect(failedCardAttempts()).toHaveLength(1);
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/venue/bookings/bk-1/charge',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'cancel', payment_intent_id: 'pi_1' }),
      }),
    );
  });

  it('does not ask the server to cancel an outcome it cannot vouch for', async () => {
    // The mirror of the ambiguous case above: if Stripe may have captured, the
    // app must not go and cancel the intent out from under a real payment.
    mockApiFetch.mockResolvedValue(CHARGE);
    mockRetrieve.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockCollect.mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
    mockConfirm.mockResolvedValue({ error: { code: 'REQUEST_TIMED_OUT', message: 'no link' } });

    const { result } = await renderHook(() => useTakePayment('bk-1'), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ attemptId: ATTEMPT })).rejects.toThrow();

    expect(
      mockApiFetch.mock.calls.some((c) => String(c[1]?.body ?? '').includes('"action":"cancel"')),
    ).toBe(false);
  });

  it('records nothing when the charge itself never created a PaymentIntent', async () => {
    // No PI, no ledger row, nothing to discount.
    mockApiFetch.mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => useTakePayment('bk-1'), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ attemptId: ATTEMPT })).rejects.toThrow('offline');
    expect(failedCardAttempts()).toEqual([]);
  });

  it('refetches the booking after a failure too', async () => {
    /**
     * Without this the webhook's flip of the row to `failed` was invisible until
     * some unrelated refetch happened: the sheet's live `payments` kept showing
     * Processing, so the row it is meant to explain never updated.
     */
    mockApiFetch.mockResolvedValue(CHARGE);
    mockRetrieve.mockResolvedValue({ error: { message: 'The payment could not be started.' } });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const spy = jest.spyOn(client, 'invalidateQueries');
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = await renderHook(() => useTakePayment('bk-1'), { wrapper: Wrapper });
    await expect(result.current.mutateAsync({ attemptId: ATTEMPT })).rejects.toThrow();

    await waitFor(() => expect(spy).toHaveBeenCalled());
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

    expect(mockApiFetch.mock.calls[0]![0]).toBe('/api/venue/bookings/bk-1/charge');
    expect(JSON.parse((mockApiFetch.mock.calls[0]![1] as { body: string }).body)).toEqual({
      action: 'refund',
      payment_id: 'pay-1',
    });
  });

  it('routes a visit payment to the booking its ledger row is anchored to (§5.7)', async () => {
    // payments[] is visit-wide, but the charge route looks the row up scoped
    // to the booking in the URL. Posting a sibling's row to the opened booking
    // 409s "This payment cannot be refunded", so the refund must follow the
    // anchor, not the line the staff member happens to have open.
    mockApiFetch.mockResolvedValue({ success: true });
    const { result } = await renderHook(() => useRefundPayment('bk-1'), { wrapper: wrapper() });
    await result.current.mutateAsync({ paymentId: 'pay-1', paymentBookingId: 'bk-2' });

    expect(mockApiFetch.mock.calls[0]![0]).toBe('/api/venue/bookings/bk-2/charge');
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
