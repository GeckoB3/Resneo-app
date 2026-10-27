/**
 * Finish setting up a collective, the services step (web `CollectiveSetupWizard`, 2026-10-27): it
 * lists every venue's own services, not only the host's. A member's is ticked when it is off the
 * page and bookable online, and saving offers the host's first, then puts the members' on the page
 * through the venue-services route, joining a page service of the same name.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockVenueServicesMissing = false;
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    const call = { path, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined };
    mockCalls.push(call);
    try {
      return Promise.resolve(mockRespond(call));
    } catch (e) {
      return Promise.reject(e);
    }
  },
}));

import { CollectiveSetupSheet } from './CollectiveSetupSheet';

const hostService = (id: string, name: string, onPage: boolean) => ({
  id,
  name,
  duration_minutes: 60,
  price_pence: 5000,
  is_active: true,
  is_bookable_online: true,
  collective: onPage
    ? {
        role: 'master',
        venue_role: 'host',
        collective_id: 'col-1',
        collective_name: 'Northside',
        host_venue_name: 'Host Venue',
        item_id: `item-${id}`,
        locked_fields: [],
        delegated_fields: [],
        status: 'up_to_date',
        status_reason: null,
        last_applied_at: null,
        hidden_reasons: [],
      }
    : null,
});

const memberService = (id: string, name: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name,
  duration_minutes: 30,
  price_pence: 2000,
  heading: null,
  bookable_online: true,
  on_page: false,
  item_id: null,
  page_name: null,
  joins: null,
  calendars: 1,
  suggested_at: null,
  ...overrides,
});

function mockRespond(call: Call): unknown {
  if (call.path === '/api/venue/appointment-services') {
    return {
      services: [hostService('h1', 'Balayage', false), hostService('h2', 'Gents cut', true)],
      collective_calendars: [],
      practitioner_services: [],
    };
  }
  if (call.path === '/api/venue/collectives') {
    return {
      collectives: [
        {
          id: 'col-1',
          slug: 'northside',
          name: 'Northside',
          hostVenueId: 'v-host',
          members: [
            { venueId: 'v-host', venueName: 'Host Venue', status: 'active' },
            { venueId: 'v-zen', venueName: 'Zen Studio', status: 'active' },
          ],
        },
      ],
    };
  }
  if (call.path.endsWith('/same-names')) return { matches: {} };
  if (call.path.endsWith('/bulk')) {
    return { results: (call.body as { ops: unknown[] }).ops.map((_, index) => ({ index, ok: true })) };
  }
  if (call.path.endsWith('/venue-services')) {
    if (mockVenueServicesMissing) throw new ApiError('Request failed (404)', 404);
    if (call.method === 'POST') {
      return {
        results: (call.body as { items: { venue_id: string; service_id: string }[] }).items.map((i) => ({ ...i, ok: true })),
      };
    }
    return {
      role: 'host',
      collective_name: 'Northside',
      host_venue_id: 'v-host',
      venues: [
        {
          venue_id: 'v-host',
          venue_name: 'Host Venue',
          is_host: true,
          services: [memberService('h1', 'Balayage'), memberService('h2', 'Gents cut', { on_page: true })],
        },
        {
          venue_id: 'v-zen',
          venue_name: 'Zen Studio',
          is_host: false,
          services: [
            memberService('z1', 'balayage'),
            memberService('z2', 'Brows'),
            memberService('z3', 'Waxing', { bookable_online: false }),
            memberService('z4', 'Lashes', { on_page: true, item_id: 'item-9' }),
          ],
        },
      ],
    };
  }
  return {};
}

async function openServicesStep() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <CollectiveSetupSheet visible collectiveId="col-1" venueName="Host Venue" onClose={jest.fn()} />
      </QueryClientProvider>,
    );
  });
  expect(
    await screen.findByText(
      'Two steps make the Northside page live. First choose which services it offers, from every venue. Then choose which calendars, at each venue, do them.',
    ),
  ).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByText('Continue'));
  });
}

const checked = (label: string) => screen.getByLabelText(label).props.accessibilityState?.checked;

beforeEach(() => {
  mockCalls.length = 0;
  mockVenueServicesMissing = false;
});

describe("CollectiveSetupSheet, every venue's services", () => {
  it("lists each member's own services, ticked when off the page and bookable online", async () => {
    await openServicesStep();
    expect(screen.getByText('Your services')).toBeTruthy();
    expect(screen.getByText('Zen Studio’s services')).toBeTruthy();
    expect(checked('Brows')).toBe(true);
    // Staff bookings only: left for the host to tick.
    expect(checked('Waxing')).toBe(false);
    // Already on the page: ticked, and not for changing here.
    expect(checked('Lashes')).toBe(true);
    expect(screen.getByLabelText('Lashes').props.accessibilityState?.disabled).toBe(true);
    // Same name as a ticked host service: it joins it.
    expect(screen.getByText('Joins your Balayage')).toBeTruthy();
    expect(screen.getByLabelText('Select all')).toBeTruthy();
    // Balayage (the host's) plus Gents cut on the page, and the member's balayage and Brows.
    expect(screen.getByText('4 services selected')).toBeTruthy();
  });

  it("offers the host's services first, then puts the members' on the page", async () => {
    await openServicesStep();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Waxing'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save and continue'));
    });
    const posts = mockCalls.filter((c) => c.method === 'POST');
    expect(posts.map((c) => c.path)).toEqual([
      '/api/venue/collectives/col-1/bulk',
      '/api/venue/collectives/col-1/venue-services',
    ]);
    expect(posts[0]?.body).toEqual({ ops: [{ op: 'offer', service_id: 'h1' }] });
    expect(posts[1]?.body).toEqual({
      action: 'add',
      mode: 'match',
      items: [
        { venue_id: 'v-zen', service_id: 'z1' },
        { venue_id: 'v-zen', service_id: 'z2' },
        { venue_id: 'v-zen', service_id: 'z3' },
      ],
    });
    expect(await screen.findByText('Who does what?')).toBeTruthy();
  });

  it("unticks every one of a venue's services at once", async () => {
    await openServicesStep();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Select all'));
    });
    // Waxing was unticked, so the first press ticks them all; the second unticks them all.
    expect(checked('Waxing')).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Select all'));
    });
    expect(checked('Brows')).toBe(false);
    await act(async () => {
      fireEvent.press(screen.getByText('Save and continue'));
    });
    expect(mockCalls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual(['/api/venue/collectives/col-1/bulk']);
  });

  it("lists the host's services alone on a server without every venue's services", async () => {
    mockVenueServicesMissing = true;
    await openServicesStep();
    expect(screen.getByLabelText('Balayage')).toBeTruthy();
    expect(screen.queryByText('Your services')).toBeNull();
    expect(screen.queryByLabelText('Brows')).toBeNull();
  });
});
