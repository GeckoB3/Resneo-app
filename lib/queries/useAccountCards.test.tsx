/**
 * The customer's Saved cards (card-on-file-plan §4.6 way 4, §5.5, §5.6): the grouped list, an
 * older server's answer, saving on the platform account with the confirm asked again while Stripe
 * finishes, and removal of a card on file and of a till card.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';

jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/payments/customer-card-sheet', () => ({ presentCardSheet: jest.fn() }));

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
  cardGroupForVenue,
  useAccountCards,
  useRemoveAccountCard,
  useStartAccountCardSetup,
  type AccountCardGroup,
  type AccountCardSetup,
} from '@/lib/queries/useAccountCards';
import { useSaveAccountCard } from '@/lib/queries/useSaveAccountCard';

/** Let the query cache's batched notifications land inside act. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

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

const collective: AccountCardGroup = {
  key: 'collective:c-1',
  kind: 'collective',
  name: 'The Beauty Parlour',
  members: [
    { venue_id: 'v-1', name: "Steph's" },
    { venue_id: 'v-2', name: 'Sage Studio' },
  ],
  cards: [
    {
      kind: 'card_on_file',
      id: 'card-1',
      venue_id: null,
      label: 'Visa ending 4242',
      expiry: '08/28',
      description: 'Secures your bookings with every member.',
      removal_text: 'It will be deleted now.',
    },
  ],
};

const setup: AccountCardSetup = {
  client_secret: 'seti_1_secret',
  setup_intent_id: 'seti_1',
  heading: 'Save a card',
  button_label: 'Save card',
  scope: 'collective',
  scope_name: 'The Beauty Parlour',
  members: [],
  consent_text: 'Your card is saved with The Beauty Parlour.',
};

describe('useAccountCards', () => {
  it('reads the grouped list with no venue', async () => {
    mockHandler = () => ({ payment_methods: [], groups: [collective], add_targets: [] });
    const { result } = await renderHook(() => useAccountCards(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCalls[0].path).toBe('/api/account/payment-methods');
    expect(result.current.data).toEqual({ grouped: true, groups: [collective], addTargets: [] });
  });

  it('reads an older server (no groups) as not grouped', async () => {
    mockHandler = () => ({ payment_methods: [], capability: 'per_venue_connected_account' });
    const { result } = await renderHook(() => useAccountCards(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ grouped: false });
  });
});

describe('cardGroupForVenue', () => {
  it('finds the collective a business belongs to, else its own group', () => {
    const own: AccountCardGroup = { ...collective, key: 'business:v-9', kind: 'business', members: [] };
    expect(cardGroupForVenue([own, collective], 'v-2')?.key).toBe('collective:c-1');
    expect(cardGroupForVenue([own, collective], 'v-9')?.key).toBe('business:v-9');
    expect(cardGroupForVenue([own], 'v-3')).toBeNull();
  });
});

describe('useStartAccountCardSetup', () => {
  it('posts the target and fills defaults', async () => {
    mockHandler = () => ({ client_secret: 's', setup_intent_id: 'seti_2', consent_text: 'x' });
    const { result } = await renderHook(() => useStartAccountCardSetup(), { wrapper: Wrapper });
    let out: AccountCardSetup | undefined;
    await act(async () => {
      out = await result.current.mutateAsync('collective:c-1');
      await flush();
    });
    expect(mockCalls[0]).toEqual({
      path: '/api/v1/me/payment-methods/card-on-file',
      method: 'POST',
      body: { target: 'collective:c-1' },
    });
    expect(out?.heading).toBe('Save a card');
    expect(out?.button_label).toBe('Save card');
  });
});

describe('useSaveAccountCard', () => {
  it('opens the sheet on the platform and asks again while Stripe finishes', async () => {
    let n = 0;
    mockHandler = () => {
      n += 1;
      return n < 3 ? { confirmed: false, setup_status: 'processing' } : { confirmed: true, card: { brand: 'visa', last4: '4242' }, secured_bookings: 2 };
    };
    const sheet = jest.fn().mockResolvedValue({ status: 'succeeded' });
    const wait = jest.fn().mockResolvedValue(undefined);
    const { result } = await renderHook(() => useSaveAccountCard(sheet, wait), { wrapper: Wrapper });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync(setup);
      await flush();
    });
    expect(sheet).toHaveBeenCalledWith({
      ticket: { client_secret: 'seti_1_secret', stripe_account_id: '', setup_intent_id: 'seti_1' },
      venueName: 'The Beauty Parlour',
      isSetupIntent: true,
    });
    expect(mockCalls.map((c) => c.path)).toEqual(Array(3).fill('/api/v1/me/payment-methods/card-on-file/confirm'));
    expect(mockCalls[0].body).toEqual({ setup_intent_id: 'seti_1' });
    expect(wait).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ status: 'saved', label: 'Visa ending 4242', securedBookings: 2 });
  });

  it('answers pending after the last try', async () => {
    mockHandler = () => ({ confirmed: false });
    const { result } = await renderHook(
      () => useSaveAccountCard(jest.fn().mockResolvedValue({ status: 'succeeded' }), jest.fn().mockResolvedValue(undefined)),
      { wrapper: Wrapper },
    );
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync(setup);
      await flush();
    });
    expect(mockCalls).toHaveLength(4);
    expect(out).toEqual({ status: 'pending' });
  });

  it('confirms nothing when the sheet was closed or failed', async () => {
    const sheet = jest.fn().mockResolvedValueOnce({ status: 'cancelled' }).mockResolvedValueOnce({ status: 'failed', message: 'Declined' });
    const { result } = await renderHook(() => useSaveAccountCard(sheet), { wrapper: Wrapper });
    let a: unknown;
    let b: unknown;
    await act(async () => {
      a = await result.current.mutateAsync(setup);
      await flush();
    });
    await act(async () => {
      b = await result.current.mutateAsync(setup);
      await flush();
    });
    expect(a).toEqual({ status: 'cancelled' });
    expect(b).toEqual({ status: 'failed', message: 'Declined' });
    expect(mockCalls).toHaveLength(0);
  });
});

describe('useRemoveAccountCard', () => {
  it('deletes a card on file by its id', async () => {
    mockHandler = () => ({ ok: true, removal_text: 'It will be deleted now.' });
    const { result } = await renderHook(() => useRemoveAccountCard(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ card: collective.cards[0] });
      await flush();
    });
    expect(mockCalls[0]).toMatchObject({ path: '/api/v1/me/payment-methods/card-on-file/card-1', method: 'DELETE' });
  });

  it('deletes a till card at its business, and turns its 409 into a question', async () => {
    const till = { ...collective.cards[0], kind: 'till_card' as const, id: 'pm_1', venue_id: 'v-1' };
    mockHandler = () => {
      throw new ApiError('x', 409, { requires_confirmation: true, message: 'This card pays for your membership.' });
    };
    const { result } = await renderHook(() => useRemoveAccountCard(), { wrapper: Wrapper });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({ card: till });
      await flush();
    });
    expect(mockCalls[0]).toMatchObject({ path: '/api/account/payment-methods/v-1/pm_1', method: 'DELETE' });
    expect(out).toEqual({ status: 'needs_confirmation', message: 'This card pays for your membership.' });

    mockHandler = () => ({});
    await act(async () => {
      out = await result.current.mutateAsync({ card: till, acknowledge: true });
      await flush();
    });
    expect(mockCalls[1].path).toBe('/api/account/payment-methods/v-1/pm_1?acknowledge=true');
    expect(out).toEqual({ status: 'removed', text: null });
  });
});
