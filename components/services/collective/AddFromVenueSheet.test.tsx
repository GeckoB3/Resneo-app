/**
 * "Add from another venue" (web `AddFromVenueDialog`): the host picks a member and one of its own
 * services, and the request carries the two ids and nothing else, because the server copies the
 * service exactly. A suggestion arrives with the venue and service chosen; a refusal shows the
 * route's own sentence.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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

import { AddFromVenueSheet } from './AddFromVenueSheet';

const venues = [
  { venue_id: 'v-zen', venue_name: 'Zen Studio' },
  { venue_id: 'v-glow', venue_name: 'Glow Bar' },
];

const servicesAt: Record<string, unknown[]> = {
  'v-zen': [
    { id: 'svc-1', name: 'Balayage', duration_minutes: 120, price_pence: 9500 },
    { id: 'svc-2', name: 'Fringe trim', duration_minutes: 15, price_pence: 0 },
  ],
  'v-glow': [],
};

async function renderSheet(ui: ReactElement) {
  const client = new QueryClient({
    // No garbage-collection timers left running after the suite.
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = (call) => {
    if (call.method === 'GET') {
      const venueId = new URL(`https://x${call.path}`).searchParams.get('source_venue_id') ?? '';
      return { services: servicesAt[venueId] ?? [] };
    }
    return { item_id: 'item-9' };
  };
});

describe('AddFromVenueSheet', () => {
  it("lists the first venue's own services and copies the chosen one with two ids only", async () => {
    const onAdded = jest.fn();
    await renderSheet(
      <AddFromVenueSheet
        onClose={jest.fn()}
        collectiveId="col-1"
        collectiveName="Northside"
        venues={venues}
        currencySymbol="£"
        onAdded={onAdded}
      />,
    );
    expect(mockCalls[0]?.path).toBe('/api/venue/collectives/col-1/offerings?source_venue_id=v-zen');
    expect(screen.getByText('Add a service from another venue')).toBeTruthy();
    expect(await screen.findByText('120 min, £95.00')).toBeTruthy();
    expect(screen.getByText('15 min, Free')).toBeTruthy();

    // Nothing chosen yet: the button waits.
    expect(screen.getByRole('button', { name: 'Copy and add to the page' }).props.accessibilityState?.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Balayage'));
    });
    expect(
      screen.getByText(
        'Zen Studio is asked whether to use its own Balayage for this. If it does, its calendars and bookings for it stay as they are.',
      ),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy and add to the page' }));
    });

    const post = mockCalls.find((c) => c.method === 'POST');
    expect(post?.path).toBe('/api/venue/collectives/col-1/offerings');
    expect(post?.body).toEqual({ source_venue_id: 'v-zen', source_service_id: 'svc-1' });
    expect(onAdded).toHaveBeenCalledWith(
      'Balayage is on the Northside page. We have asked Zen Studio whether to use its own Balayage for it.',
    );
  });

  it('opens a suggestion with its venue and service chosen, and says when a venue has nothing to add', async () => {
    await renderSheet(
      <AddFromVenueSheet
        onClose={jest.fn()}
        collectiveId="col-1"
        collectiveName="Northside"
        venues={venues}
        currencySymbol="£"
        onAdded={jest.fn()}
        initialVenueId="v-zen"
        initialServiceId="svc-2"
      />,
    );
    expect((await screen.findByLabelText('Fringe trim')).props.accessibilityState?.selected).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByText('Glow Bar'));
    });
    expect(mockCalls.at(-1)?.path).toBe('/api/venue/collectives/col-1/offerings?source_venue_id=v-glow');
    expect(await screen.findByText('Glow Bar has no services of its own to add.')).toBeTruthy();
  });

  it("shows the route's refusal and stays open", async () => {
    mockHandler = (call) => {
      if (call.method === 'GET') return { services: servicesAt['v-zen'] };
      throw new ApiError('That service is already on the page.', 409, { error: 'That service is already on the page.' });
    };
    const onAdded = jest.fn();
    await renderSheet(
      <AddFromVenueSheet
        onClose={jest.fn()}
        collectiveId="col-1"
        collectiveName="Northside"
        venues={venues}
        currencySymbol="£"
        onAdded={onAdded}
      />,
    );
    await screen.findByLabelText('Balayage');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Balayage'));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy and add to the page' }));
    });
    expect(await screen.findByText('That service is already on the page.')).toBeTruthy();
    expect(onAdded).not.toHaveBeenCalled();
  });
});
