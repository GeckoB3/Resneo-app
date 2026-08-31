/**
 * C4: payments, cards, and the ways in.
 *
 * The card removal is the one with a real trap. The server answers 409 when the
 * card pays for something, and that 409 is an ANSWER, not a failure: treating
 * it as an error would show "something went wrong" for a question, and the
 * customer would never learn what the card was for.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, ApiError: actual.ApiError, apiFetch: (...a: unknown[]) => mockApiFetch(...a) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ApiError } = require('@/lib/api/client') as typeof import('@/lib/api/client');
const {
  useCustomerPayments,
  useSavedCards,
  useRemoveCard,
  useSetPassword,
  useSignOutEverywhere,
  useSetMarketingConsent,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('./useCustomerAccount') as typeof import('./useCustomerAccount');

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue({});
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
});

const lastPath = () => String(mockApiFetch.mock.calls.at(-1)?.[0]);

describe('reading', () => {
  it('asks for all payments, or one booking’s', async () => {
    await renderHook(() => useCustomerPayments(), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(lastPath()).toBe('/api/v1/me/payments');

    await renderHook(() => useCustomerPayments('bk 1/2'), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    // Encoded, because a booking id ends up in a query string.
    expect(lastPath()).toBe('/api/v1/me/payments?booking_id=bk%201%2F2');
  });

  it('asks for cards PER VENUE, and not at all without one', async () => {
    /*
      Cards live on each venue's own Stripe connected account, so there is no
      cross-venue list to ask for. The route refuses without a venue_id; asking
      anyway would be a guaranteed 400.
    */
    await renderHook(() => useSavedCards(null), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(mockApiFetch).not.toHaveBeenCalled();

    await renderHook(() => useSavedCards('v-1'), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(lastPath()).toBe('/api/account/payment-methods?venue_id=v-1');
  });
});

describe('removing a card', () => {
  it('removes it when nothing depends on it', async () => {
    const { result } = await renderHook(() => useRemoveCard('v-1'), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync({ paymentMethodId: 'pm_1' });
    });
    expect(outcome).toEqual({ status: 'removed' });
    expect(lastPath()).toBe('/api/account/payment-methods/v-1/pm_1');
  });

  it('treats the 409 as an ANSWER and carries the message back', async () => {
    /*
      The server names WHAT the card pays for. Letting this throw would show a
      generic failure for what is actually a question, and the customer would
      never find out which membership they were about to break.
    */
    mockApiFetch.mockRejectedValueOnce(
      new ApiError('Conflict', 409, {
        requires_confirmation: true,
        message: 'This card pays for Unlimited Yoga at The Studio.',
      }),
    );
    const { result } = await renderHook(() => useRemoveCard('v-1'), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync({ paymentMethodId: 'pm_1' });
    });
    expect(outcome).toEqual({
      status: 'needs_confirmation',
      message: 'This card pays for Unlimited Yoga at The Studio.',
    });
  });

  it('sends the acknowledgement on the second attempt', async () => {
    const { result } = await renderHook(() => useRemoveCard('v-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ paymentMethodId: 'pm_1', acknowledge: true });
    });
    expect(lastPath()).toBe('/api/account/payment-methods/v-1/pm_1?acknowledge=true');
  });

  it('still throws on a real failure', async () => {
    // A 500 is not a question, and swallowing it would report a card removed
    // that is still there.
    mockApiFetch.mockRejectedValueOnce(new ApiError('Server error', 500));
    const { result } = await renderHook(() => useRemoveCard('v-1'), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ paymentMethodId: 'pm_1' })).rejects.toThrow();
    });
  });

  it('does NOT refresh anything when the server only asked for confirmation', async () => {
    /*
      Nothing changed. Refetching would make the screen flicker as though the
      card had gone, moments before asking whether to remove it.
    */
    mockApiFetch.mockRejectedValueOnce(
      new ApiError('Conflict', 409, { requires_confirmation: true, message: 'x' }),
    );
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useRemoveCard('v-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ paymentMethodId: 'pm_1' });
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('refreshes once the card is really gone', async () => {
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useRemoveCard('v-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ paymentMethodId: 'pm_1', acknowledge: true });
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });
});

describe('the ways in and out', () => {
  it('sets a password on its unaliased route', async () => {
    const { result } = await renderHook(() => useSetPassword(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('a-long-enough-password');
    });
    expect(lastPath()).toBe('/api/account/password');
    const body = JSON.parse((mockApiFetch.mock.calls.at(-1)?.[1] as { body: string }).body);
    expect(body).toEqual({ password: 'a-long-enough-password' });
  });

  it('signs out everywhere with no body to get wrong', async () => {
    const { result } = await renderHook(() => useSignOutEverywhere(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(lastPath()).toBe('/api/account/sign-out-everywhere');
  });
});

describe('marketing consent, which is per venue', () => {
  it('identifies the relationship by guest id, not by venue', async () => {
    /*
      The route keys on `guest_id`, which is the caller's row AT THAT VENUE.
      Sending a venue id would be sending the wrong kind of thing entirely, and
      this section shipped read-only in C4 precisely because the venues response
      did not carry a guest id to send.
    */
    const { result } = await renderHook(() => useSetMarketingConsent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ guestId: 'g-1', consent: false });
    });
    expect(lastPath()).toBe('/api/account/marketing-preferences');
    const opts = mockApiFetch.mock.calls.at(-1)?.[1] as { method: string; body: string };
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ guest_id: 'g-1', marketing_consent: false });
  });

  it('sends the value asked for, in both directions', async () => {
    // An opt-in and an opt-out are the same call with a different boolean, and
    // getting the direction wrong about consent is the worst way to be wrong.
    const { result } = await renderHook(() => useSetMarketingConsent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ guestId: 'g-1', consent: true });
    });
    const opts = mockApiFetch.mock.calls.at(-1)?.[1] as { body: string };
    expect(JSON.parse(opts.body).marketing_consent).toBe(true);
  });
});
