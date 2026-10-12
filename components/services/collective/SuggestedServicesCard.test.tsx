/**
 * The suggestions waiting for the host (web `SuggestedServices`; contract 10, N25). Reported
 * 2026-10-12: a member suggested a service and nothing appeared in the host's account. The host now
 * sees each one, with "Add to the page" and "Not now".
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ApiError } from '@/lib/api/client';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
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

import { SuggestedServicesCard } from './SuggestedServicesCard';

const brows = {
  service_id: 'svc-1',
  service_name: 'Brows',
  venue_id: 'v-zen',
  venue_name: 'Zen Studio',
  duration_minutes: 30,
  price_pence: 2500,
  suggested_at: '2026-10-12T20:53:45Z',
};

async function renderCard(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}

const card = (onAdd = jest.fn()) => (
  <SuggestedServicesCard collectiveId="col-1" collectiveName="Northside" currencySymbol="£" onAdd={onAdd} />
);

let mockDeclined = false;
beforeEach(() => {
  mockCalls.length = 0;
  mockDeclined = false;
  mockHandler = (call) => {
    if (call.method === 'POST') {
      mockDeclined = true;
      return { ok: true, already: false };
    }
    return { role: 'host', suggestions: mockDeclined ? [] : [brows] };
  };
});

describe('SuggestedServicesCard', () => {
  it("shows each member's suggestion, and adds one with that venue and service chosen", async () => {
    const onAdd = jest.fn();
    await renderCard(card(onAdd));
    expect(await screen.findByText('Zen Studio suggests Brows')).toBeTruthy();
    expect(screen.getByText('Suggested for the Northside page')).toBeTruthy();
    expect(screen.getByText('30 min, £25.00')).toBeTruthy();
    expect(mockCalls[0]).toEqual({ path: '/api/venue/collectives/col-1/suggestions', method: 'GET', body: undefined });
    fireEvent.press(screen.getByText('Add to the page'));
    expect(onAdd).toHaveBeenCalledWith(brows);
  });

  it('leaves one off once the host confirms, and says what happened', async () => {
    await renderCard(card());
    fireEvent.press(await screen.findByText('Not now'));
    expect(await screen.findByText('Leave Brows off the page?')).toBeTruthy();
    expect(
      screen.getByText('We will let Zen Studio know you are not adding Brows for now. Zen Studio keeps it, and can suggest it again later.'),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Leave it off'));
    });
    expect(mockCalls.find((c) => c.method === 'POST')).toEqual({
      path: '/api/venue/collectives/col-1/suggestions/decline',
      method: 'POST',
      body: { service_id: 'svc-1' },
    });
    expect(await screen.findByText('Brows is left off the Northside page. We have let Zen Studio know.')).toBeTruthy();
    expect(screen.queryByText('Zen Studio suggests Brows')).toBeNull();
  });

  it("shows the route's own words when it refuses", async () => {
    mockHandler = (call) => {
      if (call.method === 'POST') {
        throw new ApiError('Leaving a suggestion off is not ready yet. You can still add it to the page.', 409, {
          error: 'Leaving a suggestion off is not ready yet. You can still add it to the page.',
        });
      }
      return { role: 'host', suggestions: [brows] };
    };
    await renderCard(card());
    fireEvent.press(await screen.findByText('Not now'));
    const leave = await screen.findByText('Leave it off');
    await act(async () => {
      fireEvent.press(leave);
    });
    expect(await screen.findByText('Leaving a suggestion off is not ready yet. You can still add it to the page.')).toBeTruthy();
    expect(screen.getByText('Zen Studio suggests Brows')).toBeTruthy();
  });

  it('shows nothing when nothing is waiting, or to a member', async () => {
    mockHandler = () => ({ role: 'member', suggestions: [brows] });
    await renderCard(card());
    await waitFor(() => expect(mockCalls).toHaveLength(1));
    expect(screen.queryByText('Zen Studio suggests Brows')).toBeNull();
    expect(screen.queryByText('Suggested for the Northside page')).toBeNull();
  });
});
