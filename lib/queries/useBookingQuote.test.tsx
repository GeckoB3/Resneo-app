/**
 * Asking the server for the booking quote (web codebase standards plan P4.2): after the inputs
 * settle, once per request, and null (the screen's local rules) for an older server's 404, any
 * other failure and an answer without `quote_version`. jest hoists mock factories above imports,
 * so closed-over vars are `mock*`.
 */
import { act, renderHook } from '@testing-library/react-native';

const mockApiFetch = jest.fn();
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));

import { ApiError } from '@/lib/api/client';
import type { BookingQuoteRequest } from '@/lib/booking/booking-quote';
import { BOOKING_QUOTE_DEBOUNCE_MS, resetBookingQuotesForTests, useBookingQuote } from '@/lib/queries/useBookingQuote';

const request = (start = '10:00'): BookingQuoteRequest => ({
  date: '2026-12-15',
  mode: 'single',
  source: 'phone',
  items: [{ service_id: 'svc-cut', calendar_id: 'cal-1', start }],
});

const answer = (start = '10:00') => ({
  quote_version: 1,
  mode: 'single',
  cancellation_notice_hours: 24,
  card_payments_available: true,
  items: [
    {
      index: 0,
      service_id: 'svc-cut',
      calendar_id: 'cal-1',
      date: '2026-12-15',
      start,
      end: '10:30',
      duration_minutes: 30,
      buffer_minutes: 0,
      processing_tail_minutes: 0,
      estimated_end_time: null,
      price: { service_pence: 3000, addons_pence: 0, total_pence: 3000 },
      charge: { kind: 'none', amount_pence: 0, card_hold_fee_pence: null, offered_kind: 'none', offered_amount_pence: 0, card_hold_percent: null },
    },
  ],
  totals: { price_pence: 3000, duration_minutes: 30, starts_at: start, ends_at: '10:30', charge_now_pence: 0, offered_charge_pence: 0, card_hold_fee_pence: 0 },
  deposit: {
    required: false,
    amount_pence: 0,
    offered_amount_pence: 0,
    word: 'deposit',
    cancel_choice: false,
    deadline_text: null,
    cancel_label: null,
    kept: null,
    cancel_at: null,
    outcome_line: null,
  },
  card_hold: { required: false, fee_pence: 0, consent_text: null, percent: null, percent_label: null },
});

async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(BOOKING_QUOTE_DEBOUNCE_MS + 1);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockApiFetch.mockReset();
  resetBookingQuotesForTests();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('useBookingQuote', () => {
  it('asks once the inputs settle, and shows the quote for them', async () => {
    mockApiFetch.mockResolvedValue(answer());
    const { result } = await renderHook(() => useBookingQuote(request()));
    expect(result.current).toEqual({ quote: null, isLoading: true });
    expect(mockApiFetch).not.toHaveBeenCalled();
    await settle();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0]![0]).toBe('/api/venue/bookings/quote');
    expect(JSON.parse(mockApiFetch.mock.calls[0]![1].body)).toEqual(request());
    expect(result.current.quote?.totals.price_pence).toBe(3000);
    expect(result.current.isLoading).toBe(false);
  });

  it('never shows a quote for older inputs, and answers the same inputs from what it has', async () => {
    mockApiFetch.mockImplementation(async (_path: string, init: { body: string }) => answer(JSON.parse(init.body).items[0].start));
    const { result, rerender } = await renderHook(({ start }: { start: string }) => useBookingQuote(request(start)), { initialProps: { start: '10:00' } });
    await settle();
    expect(result.current.quote?.items[0]!.start).toBe('10:00');
    await rerender({ start: '11:00' });
    // The 10:00 quote is not shown for 11:00: the local figures stand until the new one is here.
    expect(result.current.quote).toBeNull();
    await settle();
    expect(result.current.quote?.items[0]!.start).toBe('11:00');
    await rerender({ start: '10:00' });
    await settle();
    expect(result.current.quote?.items[0]!.start).toBe('10:00');
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('an older server (404): null, and the route is not asked again', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Not found', 404, null));
    const first = await renderHook(() => useBookingQuote(request()));
    await settle();
    expect(first.result.current).toEqual({ quote: null, isLoading: false });
    const second = await renderHook(() => useBookingQuote(request('12:00')));
    await settle();
    expect(second.result.current.quote).toBeNull();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('any other failure, or an answer without quote_version: null (the local rules)', async () => {
    mockApiFetch.mockRejectedValueOnce(new ApiError('Something went wrong', 500, { error: 'x' }));
    const failed = await renderHook(() => useBookingQuote(request()));
    await settle();
    expect(failed.result.current.quote).toBeNull();

    const { quote_version: _v, ...older } = answer('13:00');
    mockApiFetch.mockResolvedValueOnce(older);
    const unversioned = await renderHook(() => useBookingQuote(request('13:00')));
    await settle();
    expect(unversioned.result.current.quote).toBeNull();
  });

  it('asks nothing without a request', async () => {
    const { result } = await renderHook(() => useBookingQuote(null));
    await settle();
    expect(result.current).toEqual({ quote: null, isLoading: false });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
