/**
 * A signed-in customer's card actions on a booking (web Docs/card-on-file-plan.md §5.4, §5.5, C6):
 * reading `card_hold.on_file`, the card's words, and the calls to `POST /api/v1/me/bookings/[id]/card`.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';

import {
  bookingCardLabel,
  bookingCardOnFile,
  useBookingCardAction,
  useBookingCardRemovalText,
} from '@/lib/queries/useBookingCardActions';

jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

type Call = { path: string; method: string; body: unknown; accessToken?: string };
const mockCalls: Call[] = [];
let mockHandler: (call: Call) => unknown = () => ({});
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string; accessToken?: string } = {}) => {
    const call = { path, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined, accessToken: options.accessToken };
    mockCalls.push(call);
    try {
      return Promise.resolve(mockHandler(call));
    } catch (e) {
      return Promise.reject(e);
    }
  },
}));

let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = () => ({});
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
});
afterEach(() => client.clear());

describe('bookingCardOnFile', () => {
  it('reads on_file from a held hold only', () => {
    expect(bookingCardOnFile({ state: 'held', on_file: { saved_here: true, own: true, card: { brand: 'visa', last4: '4242' } } })).toEqual({
      saved_here: true,
      own: true,
      card: { brand: 'visa', last4: '4242' },
    });
    expect(bookingCardOnFile({ state: 'held', on_file: { saved_here: false, own: false, card: null } })).toEqual({
      saved_here: false,
      own: false,
      card: null,
    });
    expect(bookingCardOnFile({ state: 'awaiting_card', on_file: { saved_here: false, own: true, card: null } })).toBeNull();
    expect(bookingCardOnFile({ state: 'held' })).toBeNull();
    expect(bookingCardOnFile(null)).toBeNull();
  });
});

describe('bookingCardLabel', () => {
  it('says the card as the web does', () => {
    expect(bookingCardLabel({ brand: 'visa', last4: '4242' })).toBe('Visa ending 4242');
    expect(bookingCardLabel({ brand: 'amex', last4: '0005' })).toBe('American Express ending 0005');
    expect(bookingCardLabel({ brand: null, last4: '1111' })).toBe('Card ending 1111');
    expect(bookingCardLabel({ brand: null, last4: null })).toBeNull();
    expect(bookingCardLabel(null)).toBeNull();
  });
});

describe('useBookingCardAction', () => {
  it("This wasn't me posts not_me and refreshes the customer's bookings", async () => {
    mockHandler = () => ({ success: true, message: "Thank you. Your card won't be used for this booking." });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useBookingCardAction('b-1'), { wrapper: Wrapper });
    let body: unknown;
    await act(async () => {
      body = await result.current.mutateAsync({ action: 'not_me' });
    });
    expect(body).toMatchObject({ message: "Thank you. Your card won't be used for this booking." });
    expect(mockCalls).toEqual([
      { path: '/api/v1/me/bookings/b-1/card', method: 'POST', body: { action: 'not_me' }, accessToken: 'token-A' },
    ]);
    expect(invalidate).toHaveBeenCalled();
  });

  it('a removal preview changes nothing, so refreshes nothing', async () => {
    mockHandler = () => ({ success: true, preview: true, removed: false, message: 'It will be deleted now.' });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useBookingCardAction('b-1'), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ action: 'remove_card', preview: true });
    });
    expect(mockCalls[0]!.body).toEqual({ action: 'remove_card', preview: true });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('removing posts remove_card', async () => {
    mockHandler = () => ({ success: true, preview: false, removed: true, message: 'It will be deleted now.' });
    const { result } = await renderHook(() => useBookingCardAction('b-1'), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ action: 'remove_card' });
    });
    expect(mockCalls[0]!.body).toEqual({ action: 'remove_card' });
  });
});

describe('useBookingCardRemovalText', () => {
  it("reads the server's words, falling back when it cannot say", async () => {
    mockHandler = () => ({ success: true, preview: true, removed: false, message: 'It will be deleted now.' });
    const { result } = await renderHook(() => useBookingCardRemovalText('b-1'), { wrapper: Wrapper });
    await expect(result.current('fallback')).resolves.toBe('It will be deleted now.');
    expect(mockCalls[0]!.body).toEqual({ action: 'remove_card', preview: true });

    mockHandler = () => {
      throw new Error('offline');
    };
    await expect(result.current('fallback')).resolves.toBe('fallback');
  });
});

// Keeps React in scope for the JSX in Wrapper under the classic runtime.
void React;
