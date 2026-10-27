/**
 * A member's own services on Manage Collective, suggested to the host many at once (owner,
 * 2026-10-27; web `MemberSuggestPanel.tsx`). Only a service off the page and not already waiting
 * can be ticked; the rest say where they stand.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import type { VenueServiceRow } from '@/lib/collective-area/venue-services';

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

import { MemberSuggestPanel } from './MemberSuggestPanel';

const row = (overrides: Partial<VenueServiceRow> & Pick<VenueServiceRow, 'id' | 'name'>): VenueServiceRow => ({
  duration_minutes: 45,
  price_pence: 3000,
  heading: 'Brows',
  bookable_online: true,
  on_page: false,
  item_id: null,
  page_name: null,
  joins: null,
  calendars: 1,
  suggested_at: null,
  ...overrides,
});

let mockServices: VenueServiceRow[] = [];

async function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <MemberSuggestPanel collectiveId="col-1" collectiveName="Northside" hostName="Host Venue" currencySymbol="£" />
      </QueryClientProvider>,
    );
  });
}

beforeEach(() => {
  mockCalls.length = 0;
  mockServices = [
    row({ id: 's1', name: 'Brow tint' }),
    row({ id: 's2', name: 'Brow lift' }),
    row({ id: 's3', name: 'Lash lift', suggested_at: '2026-10-27T09:00:00Z' }),
    row({ id: 's4', name: 'Balayage', on_page: true, item_id: 'item-1' }),
  ];
  mockHandler = (call) => {
    if (call.method === 'GET') {
      return {
        role: 'member',
        collective_name: 'Northside',
        host_venue_id: 'v-host',
        host_name: 'Host Venue',
        venues: [{ venue_id: 'v-zen', venue_name: 'Zen Studio', is_host: false, services: mockServices.map((s) => ({ ...s })) }],
      };
    }
    const ids = (call.body as { service_ids: string[] }).service_ids;
    for (const s of mockServices) if (ids.includes(s.id)) s.suggested_at = '2026-10-27T10:00:00Z';
    return { ok: true, suggested: ids.length, already_suggested: false, already_count: 0, host_name: 'Host Venue' };
  };
});

describe('MemberSuggestPanel', () => {
  it('says where each service stands, and lets only the free ones be ticked', async () => {
    await renderPanel();
    expect(await screen.findByText('Your services')).toBeTruthy();
    expect(
      screen.getByText(
        'Tick the services you would like on the Northside page and send them to Host Venue in one go. Each one Host Venue adds goes on as it is, and your calendars keep offering it.',
      ),
    ).toBeTruthy();
    expect(screen.getAllByText('Not on the page')).toHaveLength(2);
    expect(screen.getByText('Suggested to Host Venue')).toBeTruthy();
    expect(screen.getByText('On the page')).toBeTruthy();
    expect(screen.getAllByText('45 min · £30.00 · Brows')).toHaveLength(4);
    expect(screen.getByLabelText('Lash lift').props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByLabelText('Balayage').props.accessibilityState?.disabled).toBe(true);
    // Nothing ticked yet: the button waits.
    expect(screen.getByRole('button', { name: 'Suggest to Host Venue (0)' }).props.accessibilityState?.disabled).toBe(true);
  });

  it('sends every ticked service in one request, and says so', async () => {
    await renderPanel();
    await screen.findByText('Your services');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Select all shown'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Suggest to Host Venue (2)'));
    });
    expect(mockCalls.filter((c) => c.method === 'POST')).toEqual([
      { path: '/api/venue/collectives/col-1/suggestions', method: 'POST', body: { service_ids: ['s1', 's2'] } },
    ]);
    expect(await screen.findByText('Sent 2 suggestions to Host Venue.')).toBeTruthy();
    // Read again: both now wait for the host, so nothing is left to suggest.
    expect(await screen.findByText('Every service of yours is on the page or waiting for Host Venue.')).toBeTruthy();
  });

  it('names a single service it sent', async () => {
    await renderPanel();
    await screen.findByText('Your services');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Brow lift'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Suggest to Host Venue (1)'));
    });
    expect(await screen.findByText('Sent Brow lift to Host Venue.')).toBeTruthy();
  });

  it("shows the route's own words when it refuses", async () => {
    const base = mockHandler;
    mockHandler = (call) => {
      if (call.method === 'POST') {
        throw new ApiError('You are no longer part of Northside.', 403, { error: 'You are no longer part of Northside.' });
      }
      return base(call);
    };
    await renderPanel();
    await screen.findByText('Your services');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Brow tint'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Suggest to Host Venue (1)'));
    });
    expect(await screen.findByText('You are no longer part of Northside.')).toBeTruthy();
  });

  it('hides itself on a server without the route, and when the venue has nothing of its own', async () => {
    mockHandler = () => {
      throw new ApiError('Request failed (404)', 404);
    };
    await renderPanel();
    await waitFor(() => expect(mockCalls).toHaveLength(1));
    expect(screen.queryByText('Your services')).toBeNull();
  });
});
