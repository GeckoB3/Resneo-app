/**
 * Card on file, staff hooks (card-on-file-plan §4.16, §6.6, §6.8, §10): the request shapes, the
 * 100-id chunks, the count re-check, Undo across chunks, and an older server without the routes.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';

jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

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

import {
  cardCountChangedFrom,
  removeGuestCardMessage,
  useConfirmWithoutCard,
  useGuestCardOnFile,
  useNoShowCharges,
  usePreviewCardRequests,
  useSendCardRequests,
  useUndoConfirmWithoutCard,
} from '@/lib/queries/useCardsOnFile';

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

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);

describe('useConfirmWithoutCard', () => {
  it('sends explicit ids in chunks of 100 and adds up the answers', async () => {
    mockHandler = (call) => {
      const n = (call.body as { booking_ids: string[] }).booking_ids.length;
      return {
        changed: n,
        booking_ids: (call.body as { booking_ids: string[] }).booking_ids,
        unit_extra: 1,
        moved_to_booked: 0,
        skipped: [],
        skipped_count: 0,
        action_id: `act-${n}`,
        undo_until: '2026-11-17T10:05:00Z',
        message: `${n} confirmed`,
      };
    };
    const { result } = await renderHook(() => useConfirmWithoutCard(), { wrapper: Wrapper });
    let out: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      out = await result.current.mutateAsync({ bookingIds: ids(130) });
    });
    expect(mockCalls.map((c) => c.path)).toEqual([
      '/api/venue/bookings/confirm-without-card',
      '/api/venue/bookings/confirm-without-card',
    ]);
    expect((mockCalls[0].body as { booking_ids: string[] }).booking_ids).toHaveLength(100);
    expect((mockCalls[1].body as { booking_ids: string[] }).booking_ids).toHaveLength(30);
    expect(out?.changed).toBe(130);
    expect(out?.actionIds).toEqual(['act-100', 'act-30']);
    expect(out?.message).toBe(
      '130 bookings, including 2 other services in the same visits, confirmed without a card.',
    );
  });

  it('sends "Select all" as the filter and the count shown, and reads a changed count', async () => {
    mockHandler = () => {
      throw new ApiError('changed', 409, { error: 'The number of bookings has changed to 12.', code: 'CARD_COUNT_CHANGED', count: 12 });
    };
    const { result } = await renderHook(() => useConfirmWithoutCard(), { wrapper: Wrapper });
    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({ filter: { card_state: 'waiting' }, expectedCount: 10 });
      } catch (e) {
        caught = e;
      }
    });
    expect(mockCalls[0].body).toEqual({ filter: { card_state: 'waiting' }, expected_count: 10 });
    expect(cardCountChangedFrom(caught)).toBe(12);
    expect(cardCountChangedFrom(new Error('x'))).toBeNull();
  });
});

describe('useUndoConfirmWithoutCard', () => {
  it('undoes every action and adds up what came back', async () => {
    mockHandler = () => ({ undone: true, restored: 2, kept: 1 });
    const { result } = await renderHook(() => useUndoConfirmWithoutCard(), { wrapper: Wrapper });
    let out: { restored: number; kept: number } | undefined;
    await act(async () => {
      out = await result.current.mutateAsync(['a1', 'a2']);
    });
    expect(mockCalls.map((c) => c.body)).toEqual([
      { undo: true, action_id: 'a1' },
      { undo: true, action_id: 'a2' },
    ]);
    expect(out).toEqual({ restored: 4, kept: 2 });
  });
});

describe('useSendCardRequests', () => {
  it('posts the selection and keeps the server words for one request', async () => {
    mockHandler = () => ({
      clients: 12,
      emails: 12,
      texts: 9,
      reopened: 0,
      skipped_no_contact: 0,
      skipped_already_today: 0,
      failed_clients: 0,
      skipped: [],
      message: '12 clients: 12 emails and 9 texts.',
    });
    const { result } = await renderHook(() => useSendCardRequests(), { wrapper: Wrapper });
    let out: { message: string } | undefined;
    await act(async () => {
      out = await result.current.mutateAsync({ filter: { card_state: 'not_needed' }, expectedCount: 3 });
    });
    expect(mockCalls[0]).toEqual({
      path: '/api/venue/bookings/card-requests',
      method: 'POST',
      body: { filter: { card_state: 'not_needed' }, expected_count: 3 },
    });
    expect(out?.message).toBe('12 clients: 12 emails and 9 texts.');
  });

  it('words several chunks as one result', async () => {
    mockHandler = () => ({
      clients: 2,
      emails: 2,
      texts: 1,
      reopened: 0,
      skipped_no_contact: 0,
      skipped_already_today: 1,
      failed_clients: 0,
      skipped: [],
      message: 'server words',
    });
    const { result } = await renderHook(() => useSendCardRequests(), { wrapper: Wrapper });
    let out: { message: string } | undefined;
    await act(async () => {
      out = await result.current.mutateAsync({ bookingIds: ids(150) });
    });
    expect(mockCalls).toHaveLength(2);
    expect(out?.message).toBe('Card requests sent to 4 clients: 4 emails and 2 texts. 2 clients were skipped: already sent one today.');
  });
});

describe('usePreviewCardRequests', () => {
  const counts = (o: Record<string, unknown> = {}) => ({
    preview: true,
    clients: 12,
    emails: 12,
    texts: 9,
    reopened: 0,
    skipped_no_contact: 0,
    skipped_already_today: 0,
    failed_clients: 0,
    skipped: [],
    message: 'This sends to 12 clients: 12 emails and 9 texts.',
    ...o,
  });

  it('asks with preview: true and keeps the server words', async () => {
    mockHandler = () => counts();
    const { result } = await renderHook(() => usePreviewCardRequests(), { wrapper: Wrapper });
    let out: { supported: boolean; message: string; clients: number } | undefined;
    await act(async () => {
      out = await result.current.mutateAsync({ filter: { card_state: 'waiting', from_date: '2026-11-18' }, expectedCount: 14 });
    });
    expect(mockCalls[0].body).toEqual({ filter: { card_state: 'waiting', from_date: '2026-11-18' }, expected_count: 14, preview: true });
    expect(out).toMatchObject({ supported: true, clients: 12, message: 'This sends to 12 clients: 12 emails and 9 texts.' });
  });

  it('words several chunks ahead of sending', async () => {
    mockHandler = () => counts({ clients: 1, emails: 1, texts: 0, skipped_no_contact: 1 });
    const { result } = await renderHook(() => usePreviewCardRequests(), { wrapper: Wrapper });
    let out: { message: string } | undefined;
    await act(async () => {
      out = await result.current.mutateAsync({ bookingIds: ids(150) });
    });
    expect(mockCalls.map((c) => (c.body as { preview?: boolean }).preview)).toEqual([true, true]);
    expect(out?.message).toBe('This sends to 2 clients: 2 emails. 2 clients will be skipped: no email or phone.');
  });

  it('an older server that sent instead: stops after the first chunk and says so', async () => {
    mockHandler = () => counts({ preview: undefined, message: '12 clients: 12 emails and 9 texts.' });
    const { result } = await renderHook(() => usePreviewCardRequests(), { wrapper: Wrapper });
    let out: { supported: boolean; message: string } | undefined;
    await act(async () => {
      out = await result.current.mutateAsync({ bookingIds: ids(150) });
    });
    expect(mockCalls).toHaveLength(1);
    expect(out).toMatchObject({ supported: false, message: '12 clients: 12 emails and 9 texts.' });
  });
});

describe('useGuestCardOnFile', () => {
  it('fills in fields an older answer leaves out', async () => {
    mockHandler = () => ({ card: null, can_take_cards: true });
    const { result } = await renderHook(() => useGuestCardOnFile('g-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCalls[0].path).toBe('/api/venue/guests/g-1/card-on-file');
    expect(result.current.data).toEqual({
      card: null,
      till_cards: [],
      history: [],
      can_take_cards: true,
      can_remove: false,
      removal_text: null,
      add_saves_with: null,
    });
  });

  it('reads an older server without the route as no section', async () => {
    mockHandler = () => {
      throw new ApiError('Not found', 404, '<html>');
    };
    const { result } = await renderHook(() => useGuestCardOnFile('g-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useNoShowCharges', () => {
  it('reads the visit charge groups', async () => {
    mockHandler = () => ({ groups: [{ key: 'cof:1', lines: [] }] });
    const { result } = await renderHook(() => useNoShowCharges('visit-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCalls[0].path).toBe('/api/venue/visits/visit-1/charge-no-show');
    expect(result.current.data?.unchargeable).toEqual([]);
  });
});

describe('removeGuestCardMessage', () => {
  it('words a stop and a removal', () => {
    expect(removeGuestCardMessage({ ok: true, status: 'stopped', returned_bookings: 2 }, 'Amy')).toBe(
      'Card stopped. 2 bookings went back to Waiting for card and Amy has been sent a card request.',
    );
    expect(removeGuestCardMessage({ ok: true, status: 'removed', returned_bookings: 0 }, 'Amy')).toBe(
      'Card removed. It will not be used for new bookings.',
    );
  });
});
