/**
 * The post-tap settlement watch (Tap to Pay design doc §6.4).
 *
 * A successful tap used to leave the booking reading "Outstanding" with a live
 * Take payment button: the card mutation invalidates once, the instant
 * `confirmPaymentIntent` resolves, and the Stripe webhook that writes the paid
 * state lands a second or three later. These pin that the app keeps looking
 * while a card row is pending, stops the moment it settles, gives up rather than
 * polling for the rest of the shift, and never polls for cash.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/api/client', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));

// Real watch semantics, tiny delays: the backoff itself is pinned in
// settlement-watch.test.ts, and 2s/5s/10s of real time here buys nothing.
jest.mock('@/lib/payments/settlement-watch', () => ({
  ...jest.requireActual<typeof import('@/lib/payments/settlement-watch')>(
    '@/lib/payments/settlement-watch',
  ),
  SETTLEMENT_POLL_DELAYS_MS: [40, 40, 40],
}));

import { SETTLEMENT_POLL_DELAYS_MS } from '@/lib/payments/settlement-watch';
import { useBookingDetail } from '@/lib/queries/useBookingDetail';
import type { BookingDetail, BookingPaymentRow } from '@/types/booking-detail';

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Host for the teardown case: toggling it off unmounts the hook, nothing else. */
function BookingScreen() {
  useBookingDetail('bk-1');
  return null;
}

function Probe({ mounted }: { mounted: boolean }) {
  return mounted ? <BookingScreen /> : null;
}

const pendingCard: BookingPaymentRow = {
  id: 'pay-1',
  booking_id: 'bk-1',
  method: 'card_present',
  status: 'pending',
  amount_pence: 9000,
  note: null,
  // Recomputed per test so the row is never aged out of the watch window.
  created_at: '',
};

function booking(payments: BookingPaymentRow[]): BookingDetail {
  return {
    id: 'bk-1',
    status: 'Booked',
    booking_date: '2026-07-27',
    booking_time: '10:00',
    party_size: 1,
    guest_id: 'g-1',
    guest: null,
    payment_state: 'unpaid',
    balance_due_pence: 9000,
    payments,
  } as BookingDetail;
}

function inFlight(over: Partial<BookingPaymentRow> = {}): BookingPaymentRow {
  return { ...pendingCard, created_at: new Date().toISOString(), ...over };
}

/** Long enough for every remaining backoff step to have fired, if any were left. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
}

/** Only the full detail GET counts; the hook also prefetches /summary. */
function detailFetches(): number {
  return mockApiFetch.mock.calls.filter(
    ([path]) => path === '/api/venue/bookings/bk-1',
  ).length;
}

beforeEach(() => {
  mockApiFetch.mockReset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  // Each query holds a gc timer; leaving them running keeps the jest worker
  // alive, and that "failed to exit gracefully" warning is exactly the signal
  // that would later mask a genuine settlement-watch timer leak.
  client.clear();
});

describe('settlement watch', () => {
  it('keeps refetching while a card payment is pending, and stops once it settles', async () => {
    // The webhook lands on the third detail GET. Keyed off the detail path
    // because the hook also prefetches /summary through the same fetcher.
    let detailCalls = 0;
    mockApiFetch.mockImplementation(async (path: string) => {
      if (!path.endsWith('/summary')) detailCalls += 1;
      return detailCalls >= 3
        ? booking([{ ...inFlight(), status: 'succeeded' }])
        : booking([inFlight()]);
    });

    const { result } = await renderHook(() => useBookingDetail('bk-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.payment_state).toBeDefined());

    // The first refetch still returns the pre-webhook booking, so the watch
    // must go round again rather than leaving a paid booking reading unpaid.
    await waitFor(() => expect(detailFetches()).toBeGreaterThanOrEqual(3));
    await waitFor(() => expect(result.current.data?.payments?.[0].status).toBe('succeeded'));

    const afterSettling = detailFetches();
    await settle();
    expect(detailFetches()).toBe(afterSettling);
  });

  it('gives up rather than polling for the rest of the shift', async () => {
    // A webhook that never arrives (local dev, or a genuinely stuck payment)
    // must leave the app idle showing the pending row, not hammering the API.
    mockApiFetch.mockResolvedValue(booking([inFlight()]));

    await renderHook(() => useBookingDetail('bk-1'), { wrapper: Wrapper });
    await waitFor(() => expect(detailFetches()).toBe(4)); // initial + 3 backoff steps

    await settle();
    expect(detailFetches()).toBe(4);
  });

  it('cancels the chain when the screen is torn down mid-poll', async () => {
    // The watch outlives the payment sheet by design (it has to update the
    // booking behind it), so the ONLY thing that stops it early is unmount.
    mockApiFetch.mockResolvedValue(booking([inFlight()]));
    /**
     * Counted on the chain's OWN work, not on `detailFetches()`. Once the
     * screen unmounts the query has no observer, and `invalidateQueries`
     * refetches only observed queries — so the fetch count freezes whether the
     * chain stopped or is still firing timers into the void. A leak would be
     * invisible. Every `invalidateQueries` call here comes from the watch.
     */
    const invalidations = jest.spyOn(client, 'invalidateQueries');

    const { rerender } = await render(
      <Wrapper>
        <Probe mounted />
      </Wrapper>,
    );
    await waitFor(() => expect(invalidations).toHaveBeenCalled());
    // Steps must remain, or this would pass on a leaked chain just as happily.
    expect(invalidations.mock.calls.length).toBeLessThan(SETTLEMENT_POLL_DELAYS_MS.length);

    await rerender(
      <Wrapper>
        <Probe mounted={false} />
      </Wrapper>,
    );
    const atTeardown = invalidations.mock.calls.length;
    await settle();
    expect(invalidations.mock.calls.length).toBe(atTeardown);
  });

  it('never starts for cash, which the route writes as succeeded synchronously', async () => {
    mockApiFetch.mockResolvedValue(
      booking([inFlight({ method: 'cash', status: 'succeeded' })]),
    );

    const { result } = await renderHook(() => useBookingDetail('bk-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await settle();
    expect(detailFetches()).toBe(1);
  });

  it('ignores a pending row too old to still be in flight', async () => {
    // Its webhook is not coming; re-polling on every open would be pure noise.
    mockApiFetch.mockResolvedValue(
      booking([inFlight({ created_at: new Date(Date.now() - 60 * 60_000).toISOString() })]),
    );

    const { result } = await renderHook(() => useBookingDetail('bk-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await settle();
    expect(detailFetches()).toBe(1);
  });
});
