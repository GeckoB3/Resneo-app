/**
 * Switching Checkout on and off over Bearer (POS Part 5): the state read, a change applied to the
 * venue at once (so the Checkout tiles appear without waiting) with the venue and every Checkout
 * query read again, a stale answer replacing the cached state, the way back asking nothing at a
 * venue that never had Checkout, and "Hide this" kept on the server, the card hidden here at once.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import { __resetOfferHiddenForTests, useOfferHidden } from '@/lib/pos/switches/offer-dismissal';
import { onResponse, switchesResponse } from '@/lib/pos/switches/test-fixtures';
import { queryKeys } from '@/lib/queries/keys';
import {
  downloadVouchersList,
  useFeatureSwitches,
  useHidePosOffer,
  usePosWayBack,
  useSetFeatureSwitch,
} from '@/lib/queries/useFeatureSwitches';
import type { VenueBootstrap } from '@/types/venue';

const mockApiFetch = jest.fn();
const mockDownload = jest.fn();
let mockVenue: unknown = null;

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  isBackendConfigured: () => true,
}));
jest.mock('@/lib/queries/useVenue', () => ({ useVenue: () => ({ data: mockVenue }) }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});
jest.mock('@/lib/reports/pos-report-download', () => ({ downloadReportFile: (args: unknown) => mockDownload(args) }));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const offVenue = {
  id: 'venue-1',
  name: 'Bloom',
  feature_flags: { raw: {}, resolved: { waitlist_v2: true } },
  feature_offers: { pos: { state: 'available', reason: null, public_reason: null } },
} as unknown as VenueBootstrap;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mockApiFetch.mockReset();
  mockDownload.mockReset();
  mockVenue = null;
  __resetOfferHiddenForTests();
});

describe('useFeatureSwitches', () => {
  it('reads the state over Bearer', async () => {
    const state = switchesResponse();
    mockApiFetch.mockResolvedValue(state);
    const { result } = await renderHook(() => useFeatureSwitches(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(state));
    expect(mockApiFetch).toHaveBeenCalledWith('/api/venue/feature-switches', { accessToken: 'token-A' });
  });

  it('asks nothing when not enabled', async () => {
    await renderHook(() => useFeatureSwitches({ enabled: false }), { wrapper });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('useSetFeatureSwitch', () => {
  it('sends the change and shows the Checkout tiles at once', async () => {
    client.setQueryData(queryKeys.venue.bootstrap('token-A'), offVenue);
    const after = onResponse();
    mockApiFetch.mockResolvedValue({ ok: true, switches: after });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useSetFeatureSwitch(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ feature: 'pos_enabled', on: true, client_request_id: 'r1', version: 1 });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/venue/feature-switches',
      expect.objectContaining({
        accessToken: 'token-A',
        method: 'POST',
        body: JSON.stringify({ feature: 'pos_enabled', on: true, client_request_id: 'r1', version: 1 }),
      }),
    );
    const venue = client.getQueryData<VenueBootstrap>(queryKeys.venue.bootstrap('token-A'));
    expect(venue?.feature_flags.resolved.pos_enabled).toBe(true);
    expect(venue?.feature_offers?.pos?.state).toBe('on');
    expect(client.getQueryData(queryKeys.posSwitches.state('token-A'))).toEqual(after);
    // The venue and every Checkout query (the POS bootstrap among them) are read again.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.venue.all() });
    // Only the venue and the POS bootstrap are read again, never every Checkout query at once.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [...queryKeys.pos.all(), 'bootstrap'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.pos.all() });
  });

  it('leaves the venue alone when the caller applies the last answer itself', async () => {
    client.setQueryData(queryKeys.venue.bootstrap('token-A'), offVenue);
    mockApiFetch.mockResolvedValue({ ok: true, switches: onResponse() });
    const { result } = await renderHook(() => useSetFeatureSwitch({ deferApply: true }), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ feature: 'pos_enabled', on: true, client_request_id: 'r1', version: 1 });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData<VenueBootstrap>(queryKeys.venue.bootstrap('token-A'))?.feature_flags.resolved.pos_enabled).toBeUndefined();
  });

  it('replaces the cached state with the fresh one a stale answer carries', async () => {
    const fresh = switchesResponse({ switches: { pos_enabled: { version: 9 } } });
    mockApiFetch.mockRejectedValue(new ApiError('Changed', 412, { error: 'Changed', code: 'SWITCH_STALE', switches: fresh }));
    const { result } = await renderHook(() => useSetFeatureSwitch(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ feature: 'pos_enabled', on: true, client_request_id: 'r1', version: 1 }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(queryKeys.posSwitches.state('token-A'))).toEqual(fresh);
  });
});

describe('usePosWayBack', () => {
  it('asks nothing of a venue that never had Checkout', async () => {
    mockVenue = offVenue;
    const { result } = await renderHook(() => usePosWayBack(offVenue, true), { wrapper });
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current).toEqual({ orders: false, ordersNewCount: null, salesHistory: false });
  });

  it('keeps Orders and Sales history after Checkout went off with things to finish', async () => {
    const switchedOff = { ...offVenue, feature_flags: { raw: { pos_enabled: false }, resolved: { pos_enabled: false } } } as unknown as VenueBootstrap;
    mockVenue = switchedOff;
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/venue/shop/orders/badge') return { new_count: 1, unfinished_count: 2 };
      if (path === '/api/venue/pos/sales?status=open') return { sales: [{ id: 's1' }], next_cursor: null };
      if (path === '/api/venue/pos/sessions') return { tills: [] };
      throw new Error(`unexpected ${path}`);
    });
    const { result } = await renderHook(() => usePosWayBack(switchedOff, true), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ orders: true, ordersNewCount: 1, salesHistory: true }));
  });

  it('keeps Sales history while a till is open, though nothing else is left', async () => {
    const switchedOff = { ...offVenue, feature_flags: { raw: { pos_enabled: false }, resolved: { pos_enabled: false } } } as unknown as VenueBootstrap;
    mockVenue = switchedOff;
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/venue/shop/orders/badge') return { new_count: 0, unfinished_count: 0 };
      if (path === '/api/venue/pos/sales?status=open') return { sales: [], next_cursor: null };
      if (path === '/api/venue/pos/sessions') return { tills: [{ id: 't1', name: 'Front desk', session: { id: 'sess-1' } }] };
      throw new Error(`unexpected ${path}`);
    });
    const { result } = await renderHook(() => usePosWayBack(switchedOff, true), { wrapper });
    await waitFor(() => expect(result.current.salesHistory).toBe(true));
    expect(result.current.orders).toBe(false);
  });

  it("asks a team member's orders only", async () => {
    const switchedOff = { ...offVenue, feature_flags: { raw: { pos_enabled: false }, resolved: { pos_enabled: false } } } as unknown as VenueBootstrap;
    mockVenue = switchedOff;
    mockApiFetch.mockResolvedValue({ new_count: 0, unfinished_count: 1 });
    const { result } = await renderHook(() => usePosWayBack(switchedOff, false), { wrapper });
    await waitFor(() => expect(result.current.orders).toBe(true));
    expect(result.current.salesHistory).toBe(false);
    expect(mockApiFetch.mock.calls.map((c) => c[0])).toEqual(['/api/venue/shop/orders/badge']);
  });
});

describe('useHidePosOffer', () => {
  it('keeps the dismissal on the server, hides the card here at once, and reads the venue again', async () => {
    mockApiFetch.mockResolvedValue({ ok: true });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(
      () => ({ hide: useHidePosOffer('venue-1_staff-1'), hidden: useOfferHidden('venue-1_staff-1') }),
      { wrapper },
    );
    expect(result.current.hidden).toBe(false);
    await act(async () => {
      await result.current.hide.mutateAsync();
    });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/venue/prompts/dismiss', {
      accessToken: 'token-A',
      method: 'POST',
      body: JSON.stringify({ key: 'pos_offer' }),
    });
    await waitFor(() => expect(result.current.hidden).toBe(true));
    // The venue's dismissed_prompts and shut pos_door take over from here.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.venue.all() });
  });

  it('keeps nothing on the phone between sessions: the server is the record', async () => {
    mockApiFetch.mockResolvedValue({ ok: true });
    const { result } = await renderHook(() => useHidePosOffer('venue-1_staff-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    __resetOfferHiddenForTests();
    const fresh = await renderHook(() => useOfferHidden('venue-1_staff-1'), { wrapper });
    expect(fresh.result.current).toBe(false);
  });

  it('does not hide the card when the server refuses', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Nope', 500, { error: 'Nope' }));
    const { result } = await renderHook(
      () => ({ hide: useHidePosOffer('venue-1_staff-1'), hidden: useOfferHidden('venue-1_staff-1') }),
      { wrapper },
    );
    await act(async () => {
      await result.current.hide.mutateAsync().catch(() => undefined);
    });
    expect(result.current.hidden).toBe(false);
  });
});

describe('downloadVouchersList', () => {
  it('downloads the server-built list through the share sheet', async () => {
    mockDownload.mockResolvedValue({ ok: true, filename: 'vouchers.csv' });
    await expect(downloadVouchersList('token-A', 'Download the list')).resolves.toEqual({ ok: true });
    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/venue/feature-switches/vouchers.csv', accessToken: 'token-A', mimeType: 'text/csv' }),
    );
  });

  it("passes on the server's sentence when refused", async () => {
    mockDownload.mockResolvedValue({ ok: false, message: 'Only admins can download this.' });
    await expect(downloadVouchersList('token-A', 'Download the list')).resolves.toEqual({ ok: false, message: 'Only admins can download this.' });
  });
});
