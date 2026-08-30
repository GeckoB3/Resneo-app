/**
 * C3: buying something, minus the one part that cannot be tested.
 *
 * The card sheet is a native module, so it is injected here. Everything around
 * it is ordinary async code, and that is where the mistakes live: opening the
 * sheet in the wrong mode, refreshing after a customer backed out, or trusting
 * a half-formed ticket.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});
// The native SDK is never loaded in a test; the hook takes the sheet as an
// argument precisely so this mock is not load-bearing.
jest.mock('@/lib/payments/customer-card-sheet', () => ({ presentCardSheet: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCustomerPurchase } = require('./useCustomerPurchase') as typeof import('./useCustomerPurchase');

let client: QueryClient;
const sheet = jest.fn();

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const TICKET = { client_secret: 'seti_1_secret', stripe_account_id: 'acct_venue1' };

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue(TICKET);
  sheet.mockReset().mockResolvedValue({ status: 'succeeded' });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
});

async function buy(args: Partial<Parameters<ReturnType<typeof useCustomerPurchase>['mutateAsync']>[0]> = {}) {
  const { result } = await renderHook(() => useCustomerPurchase(sheet), { wrapper });
  let outcome: unknown;
  await act(async () => {
    outcome = await result.current.mutateAsync({
      kind: 'credits',
      venueId: 'v-1',
      venueName: 'The Studio',
      productId: 'p-1',
      ...args,
    } as never);
  });
  return outcome as { status: string; message?: string };
}

describe('which route opens which purchase', () => {
  it.each([
    ['membership', '/api/account/memberships/checkout'],
    ['credits', '/api/account/credits/purchase'],
    ['course', '/api/account/courses/checkout'],
    ['save_card', '/api/account/payment-methods/setup-intent'],
  ])('%s starts at %s', async (kind, path) => {
    await buy({ kind: kind as never });
    expect(String(mockApiFetch.mock.calls[0][0])).toBe(path);
  });

  it('sends the venue, because the money goes to its own Stripe account', async () => {
    await buy();
    const body = JSON.parse((mockApiFetch.mock.calls[0][1] as { body: string }).body);
    expect(body).toEqual({ venue_id: 'v-1', product_id: 'p-1' });
  });

  it('omits a product when there is none, rather than sending undefined', async () => {
    // Saving a card buys nothing. A `product_id: undefined` in the body is a
    // key the route has to defend against for no reason.
    await buy({ kind: 'save_card', productId: undefined });
    const body = JSON.parse((mockApiFetch.mock.calls[0][1] as { body: string }).body);
    expect(body).toEqual({ venue_id: 'v-1' });
  });
});

describe('the sheet is opened in the right mode', () => {
  it.each([
    ['membership', true],
    ['save_card', true],
    ['credits', false],
    ['course', false],
  ])('%s uses setup intent: %s', async (kind, isSetup) => {
    /*
      The secret and the mode have to agree. A membership stores a card to
      charge on a schedule; credits are paid for now. Opening the wrong one
      fails in a way the customer cannot act on.
    */
    await buy({ kind: kind as never });
    expect(sheet.mock.calls[0][0].isSetupIntent).toBe(isSetup);
  });

  it('names the VENUE on the sheet, not ResNeo', async () => {
    // They are paying the salon, not the software. A sheet naming the wrong
    // party is how a legitimate charge gets disputed.
    await buy();
    expect(sheet.mock.calls[0][0].venueName).toBe('The Studio');
  });

  it('passes the venue’s connected account through untouched', async () => {
    await buy();
    expect(sheet.mock.calls[0][0].ticket.stripe_account_id).toBe('acct_venue1');
  });
});

describe('refusing to open a sheet it cannot open properly', () => {
  it('stops when the server returns no client secret', async () => {
    /*
      Better to fail before the card field than after. A Payment Element opened
      against a missing intent either refuses uselessly or, with the wrong
      account, charges the wrong venue.
    */
    mockApiFetch.mockResolvedValue({ stripe_account_id: 'acct_venue1' });
    const { result } = await renderHook(() => useCustomerPurchase(sheet), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ kind: 'credits', venueId: 'v-1', venueName: 'X' }),
      ).rejects.toThrow();
    });
    expect(sheet).not.toHaveBeenCalled();
  });

  it('stops when the server returns no connected account', async () => {
    mockApiFetch.mockResolvedValue({ client_secret: 'seti_1_secret' });
    const { result } = await renderHook(() => useCustomerPurchase(sheet), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ kind: 'credits', venueId: 'v-1', venueName: 'X' }),
      ).rejects.toThrow();
    });
    expect(sheet).not.toHaveBeenCalled();
  });
});

describe('what happens after the sheet closes', () => {
  it('refreshes what the customer holds once paid', async () => {
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    await buy();
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it('does NOT refresh when the customer backed out', async () => {
    /*
      A cancelled sheet changed nothing. Refetching would make the screen
      flicker as though something had happened, to somebody who deliberately
      decided it should not.
    */
    sheet.mockResolvedValue({ status: 'cancelled' });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const outcome = await buy();
    expect(outcome.status).toBe('cancelled');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does NOT refresh when the payment failed', async () => {
    sheet.mockResolvedValue({ status: 'failed', message: 'Card declined' });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const outcome = await buy();
    expect(outcome.status).toBe('failed');
    expect(outcome.message).toBe('Card declined');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('reports a cancellation as its own outcome, not as an error', async () => {
    // Somebody who changed their mind has not hit a problem, and should not be
    // shown a red message saying they have.
    sheet.mockResolvedValue({ status: 'cancelled' });
    expect((await buy()).status).toBe('cancelled');
  });
});
