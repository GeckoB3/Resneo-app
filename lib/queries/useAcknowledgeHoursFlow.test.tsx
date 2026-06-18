/**
 * F3 — booking-impact 409 "acknowledge affected bookings" threading.
 *
 * Narrowing opening hours (or a calendar's working hours) can leave existing
 * upcoming bookings outside the new window. The web routes reply 409
 * `{ requires_confirmation: true, message }` UNLESS the request carries
 * `?acknowledge_affected_bookings=true`. These tests pin that the app hooks:
 *   1. send the bare path by default (and surface the 409 body to the caller), and
 *   2. append the exact `?acknowledge_affected_bookings=true` query param when the
 *      caller re-runs with `{ acknowledge: true }`.
 *
 * The query-param name is verified against the real routes in C:\Resneo:
 *   - src/app/api/venue/opening-hours/route.ts  (acknowledge_affected_bookings)
 *   - src/app/api/venue/practitioners/route.ts  (acknowledge_affected_bookings)
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockToken = 'token-A';
const mockApiFetch = jest.fn();

// Keep the REAL ApiError + the typed guards (they are pure); only stub the
// network call `apiFetch`. This way `instanceof ApiError` and
// `isRequiresConfirmationBody` behave exactly as in production.
jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

import { ApiError, isRequiresConfirmationBody } from '@/lib/api/client';
import { useUpdateOpeningHours } from '@/lib/queries/useVenueSettings';
import { usePatchPractitioner } from '@/lib/queries/useAvailabilityManage';

// Build real ApiError instances the way client.ts throws them.
function apiError(status: number, body: unknown): ApiError {
  return new ApiError(`Request failed (${status})`, status, body);
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const ACK_PARAM = 'acknowledge_affected_bookings=true';

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('useUpdateOpeningHours — acknowledge threading', () => {
  it('PATCHes the bare path by default and surfaces the 409 requires_confirmation body', async () => {
    mockApiFetch.mockRejectedValueOnce(
      apiError(409, {
        requires_confirmation: true,
        affected_count: 2,
        message: '2 bookings fall outside the new hours.',
      }),
    );

    const { result } = await renderHook(() => useUpdateOpeningHours(), { wrapper: makeWrapper() });

    let caught: unknown;
    await act(async () => {
      caught = await result.current.mutateAsync({ '1': { closed: true } }).catch((e) => e);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // First attempt: no acknowledge query param.
    const [firstPath] = mockApiFetch.mock.calls[0];
    expect(firstPath).toBe('/api/venue/opening-hours');
    expect(String(firstPath)).not.toContain(ACK_PARAM);

    // The 409 body is preserved on the thrown ApiError for the armed-confirm UI.
    expect(caught).toBeInstanceOf(ApiError);
    const err = caught as ApiError;
    expect(err.status).toBe(409);
    expect(isRequiresConfirmationBody(err.body)).toBe(true);
    expect((err.body as { message?: string }).message).toContain('outside the new hours');
  });

  it('re-runs with ?acknowledge_affected_bookings=true when acknowledge:true', async () => {
    mockApiFetch.mockResolvedValueOnce({ opening_hours: {} });

    const { result } = await renderHook(() => useUpdateOpeningHours(), { wrapper: makeWrapper() });

    await result.current.mutateAsync({ '1': { closed: true }, acknowledge: true });

    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe(`/api/venue/opening-hours?${ACK_PARAM}`);
    // `acknowledge` must NOT be serialized into the PATCH body — it is a query flag.
    expect(JSON.parse((opts as { body: string }).body)).toEqual({ '1': { closed: true } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('usePatchPractitioner — acknowledge threading', () => {
  it('PATCHes the bare path by default', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true });

    const { result } = await renderHook(() => usePatchPractitioner(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ id: 'prac_1', working_hours: { '1': [{ start: '09:00', end: '17:00' }] } });

    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe('/api/venue/practitioners');
    // id stays in the body; acknowledge is absent.
    const sent = JSON.parse((opts as { body: string }).body);
    expect(sent.id).toBe('prac_1');
    expect(sent.acknowledge).toBeUndefined();
  });

  it('appends ?acknowledge_affected_bookings=true and strips acknowledge from the body', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true });

    const { result } = await renderHook(() => usePatchPractitioner(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({
      id: 'prac_1',
      working_hours: { '1': [{ start: '10:00', end: '12:00' }] },
      acknowledge: true,
    });

    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe(`/api/venue/practitioners?${ACK_PARAM}`);
    const sent = JSON.parse((opts as { body: string }).body);
    expect(sent.id).toBe('prac_1');
    expect(sent.working_hours).toEqual({ '1': [{ start: '10:00', end: '12:00' }] });
    expect(sent.acknowledge).toBeUndefined();
  });

  it('surfaces the 409 body so the caller can re-run acknowledged', async () => {
    mockApiFetch.mockRejectedValueOnce(
      apiError(409, {
        requires_confirmation: true,
        message: 'Calendar narrowing affects 1 booking.',
      }),
    );

    const { result } = await renderHook(() => usePatchPractitioner(), { wrapper: makeWrapper() });

    let caught: unknown;
    await act(async () => {
      caught = await result.current.mutateAsync({ id: 'prac_1', working_hours: { '1': [] } }).catch((e) => e);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    const err = caught as ApiError;
    expect(err.status).toBe(409);
    expect(isRequiresConfirmationBody(err.body)).toBe(true);
  });
});
