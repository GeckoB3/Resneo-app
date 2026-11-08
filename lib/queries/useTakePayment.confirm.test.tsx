/**
 * Web PAY-A-F19 (owner, 2026-11-08): the charge route caps a typed amount at 1,000, but a blank
 * amount charges the whole balance with no cap. The owner chose to confirm that, not refuse it:
 * once the card is read and before it is charged, staff are asked "Charge £1,240.00 to the card
 * ending 4242?". "Not now" cancels the PaymentIntent and nothing is taken. A typed amount, or a
 * whole balance at or under the cap, is charged as before with no question.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();
const mockRetrieve = jest.fn();
const mockCollect = jest.fn();
const mockConfirm = jest.fn();

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...a: unknown[]) => mockApiFetch(...a) };
});
jest.mock('@/lib/payments/terminal-sdk', () => ({
  getTerminalSdk: () => ({
    useStripeTerminal: () => ({
      retrievePaymentIntent: (...a: unknown[]) => mockRetrieve(...a),
      collectPaymentMethod: (...a: unknown[]) => mockCollect(...a),
      confirmPaymentIntent: (...a: unknown[]) => mockConfirm(...a),
      cancelCollectPaymentMethod: jest.fn(),
    }),
  }),
  isDefiniteCardFailure: () => false,
  isServerCancelledAttempt: () => false,
  PAYMENT_TIMED_OUT_MESSAGE: 'Timed out',
  terminalErrorMessage: (_e: unknown, f: string) => f,
}));
const mockRecordFailed = jest.fn();
jest.mock('@/lib/payments/failed-attempts', () => ({
  recordFailedCardAttempt: (...a: unknown[]) => mockRecordFailed(...a),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useTakePayment } = require('./useTakePayment') as typeof import('./useTakePayment');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ChargeNotConfirmedError } = require('@/lib/payments/card-outcome') as typeof import('@/lib/payments/card-outcome');

const CARD_PI = {
  id: 'pi_1',
  paymentMethod: { cardPresentDetails: { brand: 'visa', last4: '4242' } },
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function serverCharges(amountPence: number) {
  mockApiFetch.mockImplementation(async (_path: string, init: { body?: string }) => {
    const body = JSON.parse(init.body ?? '{}') as { action?: string };
    if (body.action === 'cancel') return { success: true };
    return { payment_intent_id: 'pi_1', client_secret: 'secret_1', amount_pence: amountPence };
  });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockRecordFailed.mockReset();
  mockRetrieve.mockReset().mockResolvedValue({ paymentIntent: { id: 'pi_1' } });
  mockCollect.mockReset().mockResolvedValue({ paymentIntent: CARD_PI });
  mockConfirm.mockReset().mockResolvedValue({ paymentIntent: CARD_PI });
});

async function take(input: Partial<Parameters<ReturnType<typeof useTakePayment>['mutateAsync']>[0]>) {
  const { result } = await renderHook(() => useTakePayment('bk-1'), { wrapper });
  let outcome: unknown;
  let failure: unknown;
  await act(async () => {
    try {
      outcome = await result.current.mutateAsync({ attemptId: 'att-1', ...input });
    } catch (e) {
      failure = e;
    }
  });
  return { outcome, failure };
}

describe('a whole-balance card charge above the cap', () => {
  it('asks with the amount and the card, and charges only after a yes', async () => {
    serverCharges(124_000);
    const confirmLargeCharge = jest.fn(async () => true);

    const { outcome } = await take({ confirmLargeCharge });

    expect(confirmLargeCharge).toHaveBeenCalledWith({
      amountPence: 124_000,
      card: { brand: 'visa', last4: '4242' },
    });
    // Asked after the card was read and before it was charged.
    expect(mockCollect.mock.invocationCallOrder[0]).toBeLessThan(confirmLargeCharge.mock.invocationCallOrder[0]);
    expect(confirmLargeCharge.mock.invocationCallOrder[0]).toBeLessThan(mockConfirm.mock.invocationCallOrder[0]);
    expect(outcome).toMatchObject({ amountPence: 124_000 });
  });

  it('takes nothing on "Not now": no confirm, the intent is cancelled', async () => {
    serverCharges(124_000);

    const { failure } = await take({ confirmLargeCharge: async () => false });

    expect(failure).toBeInstanceOf(ChargeNotConfirmedError);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/venue/bookings/bk-1/charge',
      expect.objectContaining({ body: JSON.stringify({ action: 'cancel', payment_intent_id: 'pi_1' }) }),
    );
    expect(mockRecordFailed).toHaveBeenCalledWith(expect.objectContaining({ paymentIntentId: 'pi_1' }));
  });
});

describe('charges that need no question', () => {
  it('a whole balance at or under the cap', async () => {
    serverCharges(100_000);
    const confirmLargeCharge = jest.fn(async () => true);
    await take({ confirmLargeCharge });
    expect(confirmLargeCharge).not.toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it('a typed amount', async () => {
    serverCharges(50_000);
    const confirmLargeCharge = jest.fn(async () => true);
    await take({ amountPence: 50_000, confirmLargeCharge });
    expect(confirmLargeCharge).not.toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });
});
