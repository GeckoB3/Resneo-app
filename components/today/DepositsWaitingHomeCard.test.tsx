/**
 * The Today screen's "waiting for payment" card (web Docs/deposit-handling-review-plan.md DH3):
 * hidden when nothing waits and when the list cannot be read (an older server's 404, any failure);
 * the headline; each row's client, text, amount and word, status and link labels; Send payment link
 * only when the client can be reached; Keep without deposit only on a waiting booking, asked first;
 * Open goes to the booking.
 *
 * The route is mocked at `apiFetch` with a real QueryClient, so the hook's own handling and the
 * refetch after an action are what the tests see.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import type { DepositWaitingItem, DepositsWaitingResponse } from '@/types/deposits-waiting';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/haptics', () => ({
  hapticSelect: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticTap: jest.fn(),
  hapticWarning: jest.fn(),
  hapticError: jest.fn(),
}));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

const mockToast = { show: jest.fn(), success: jest.fn(), error: jest.fn(), info: jest.fn(), dismiss: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockHandler: (call: Call) => unknown = () => ({});
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    const call = { path, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined };
    mockCalls.push(call);
    try {
      return Promise.resolve(mockHandler(call));
    } catch (e) {
      return Promise.reject(e);
    }
  },
}));

import { DEPOSITS_SHOWN, DepositsWaitingHomeCard } from './DepositsWaitingHomeCard';

function item(n: number, partial: Partial<DepositWaitingItem> = {}): DepositWaitingItem {
  return {
    booking_id: `booking-${n}`,
    client_name: `Client ${n}`,
    text: `Root Tint, Tue 1 Dec 1${n}:00`,
    amount_pence: 2000,
    word: 'deposit',
    state: 'waiting',
    cancel_at: '2026-12-02T13:00:00Z',
    status_label: 'Cancelled Wed 2 Dec, 13:00 if not paid',
    link_label: 'Link sent Tue 1 Dec, 09:12',
    can_send: true,
    ...partial,
  };
}

function list(items: DepositWaitingItem[]): DepositsWaitingResponse {
  return { items, count: items.length, currency: 'GBP' };
}

let listAnswer: unknown = list([]);
let writeAnswer: unknown = { success: true };

let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function renderCard() {
  await render(
    <Wrapper>
      <DepositsWaitingHomeCard />
    </Wrapper>,
  );
}

const gets = () => mockCalls.filter((c) => c.method === 'GET' && c.path === '/api/venue/deposits-waiting');

beforeEach(() => {
  mockCalls.length = 0;
  mockPush.mockReset();
  Object.values(mockToast).forEach((fn) => fn.mockReset());
  listAnswer = list([]);
  writeAnswer = { success: true };
  mockHandler = (call) => {
    const answer = call.method === 'GET' ? listAnswer : writeAnswer;
    if (answer instanceof Error) throw answer;
    return answer;
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
});
afterEach(() => client.clear());

describe('DepositsWaitingHomeCard', () => {
  it('is hidden when nothing waits', async () => {
    await renderCard();
    await waitFor(() => expect(gets()).toHaveLength(1));
    expect(screen.queryByTestId('deposits-waiting-home-card')).toBeNull();
  });

  it('is hidden on an older server (404) and when the list cannot be read', async () => {
    listAnswer = new ApiError('Not found', 404, null);
    await renderCard();
    await waitFor(() => expect(gets()).toHaveLength(1));
    expect(screen.queryByTestId('deposits-waiting-home-card')).toBeNull();
  });

  it('shows the headline and each row as the server words it', async () => {
    listAnswer = list([
      item(1),
      item(2, {
        word: 'payment',
        state: 'kept',
        cancel_at: null,
        status_label: 'Stays booked if not paid',
        link_label: 'No link sent yet',
        can_send: false,
        amount_pence: 4500,
      }),
    ]);
    await renderCard();
    expect(await screen.findByText('2 upcoming bookings are waiting for payment')).toBeTruthy();
    expect(screen.getByText('Client 1')).toBeTruthy();
    expect(screen.getByText('Root Tint, Tue 1 Dec 11:00')).toBeTruthy();
    expect(screen.getByText('£20.00 deposit')).toBeTruthy();
    expect(screen.getByText('Cancelled Wed 2 Dec, 13:00 if not paid')).toBeTruthy();
    expect(screen.getByText('Link sent Tue 1 Dec, 09:12')).toBeTruthy();
    expect(screen.getByText('£45.00 payment')).toBeTruthy();
    expect(screen.getByText('Stays booked if not paid')).toBeTruthy();
    expect(screen.getByText('No link sent yet')).toBeTruthy();
    // Send only where the client can be reached; Keep only on the waiting one.
    expect(screen.getAllByText('Send payment link')).toHaveLength(1);
    expect(screen.getAllByText('Keep without deposit')).toHaveLength(1);
    expect(screen.queryByText('Keep without payment')).toBeNull();
    expect(screen.getAllByText('Open')).toHaveLength(2);
  });

  it('says 1 booking in the singular', async () => {
    listAnswer = list([item(1)]);
    await renderCard();
    expect(await screen.findByText('1 upcoming booking is waiting for payment')).toBeTruthy();
  });

  it('sends the payment link and reads the list again', async () => {
    listAnswer = list([item(1)]);
    await renderCard();
    await fireEvent.press(await screen.findByText('Send payment link'));
    await waitFor(() =>
      expect(mockCalls.find((c) => c.method === 'POST')).toEqual({
        path: '/api/venue/bookings/booking-1/deposit',
        method: 'POST',
        body: { action: 'send_payment_link' },
      }),
    );
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Payment link sent to Client 1.'));
    await waitFor(() => expect(gets().length).toBeGreaterThan(1));
  });

  it('asks before keeping the booking, then keeps it', async () => {
    listAnswer = list([item(1)]);
    await renderCard();
    await fireEvent.press(await screen.findByText('Keep without deposit'));
    expect(screen.getByText('Keep without the deposit?')).toBeTruthy();
    expect(
      screen.getByText(
        'The booking stays booked even if the deposit is not paid. Client 1 is sent a confirmation that says the £20.00 deposit is still due, with the payment link.',
      ),
    ).toBeTruthy();
    expect(mockCalls.some((c) => c.method === 'PATCH')).toBe(false);
    await fireEvent.press(screen.getByText('Keep booking'));
    await waitFor(() =>
      expect(mockCalls.find((c) => c.method === 'PATCH')).toEqual({
        path: '/api/venue/bookings/booking-1',
        method: 'PATCH',
        body: { status: 'Booked', accept_unpaid: true },
      }),
    );
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Kept the booking for Client 1.'));
  });

  it('says the server words when sending fails', async () => {
    listAnswer = list([item(1)]);
    mockHandler = (call) => {
      if (call.method === 'GET') return listAnswer;
      throw new ApiError('Conflict', 409, { error: 'This booking no longer owes a deposit.' });
    };
    await renderCard();
    await fireEvent.press(await screen.findByText('Send payment link'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('This booking no longer owes a deposit.'));
  });

  it('opens the booking', async () => {
    listAnswer = list([item(1)]);
    await renderCard();
    await fireEvent.press(await screen.findByText('Open'));
    expect(mockPush).toHaveBeenCalledWith('/booking/booking-1');
  });

  it('lists five, then Show all', async () => {
    listAnswer = list([1, 2, 3, 4, 5, 6, 7].map((n) => item(n)));
    await renderCard();
    await screen.findByText('7 upcoming bookings are waiting for payment');
    expect(screen.getAllByText('Open')).toHaveLength(DEPOSITS_SHOWN);
    await fireEvent.press(screen.getByText('Show all 7'));
    expect(screen.getAllByText('Open')).toHaveLength(7);
  });
});
